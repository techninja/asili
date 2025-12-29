import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const TEST_DNA_FILE = './test-data/AncestryDNA.txt';
const BASE_URL = 'http://localhost:4242';

async function waitForProgressWithTimeout(page, completionCheck, progressCheck, totalTimeout, progressTimeout) {
    const startTime = Date.now();
    let lastProgressTime = startTime;
    let lastProgress = null;
    
    while (Date.now() - startTime < totalTimeout) {
        // Check if completed
        const isComplete = await page.evaluate(completionCheck);
        if (isComplete) {
            return;
        }
        
        // Check for progress updates
        const currentProgress = await page.evaluate(progressCheck);
        if (currentProgress && currentProgress !== lastProgress) {
            console.log(`    🔄 Progress: ${currentProgress}`);
            lastProgress = currentProgress;
            lastProgressTime = Date.now();
        }
        
        // Check if we've exceeded progress timeout
        if (Date.now() - lastProgressTime > progressTimeout) {
            throw new Error(`No progress update received in ${progressTimeout/1000}s`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Total timeout of ${totalTimeout/1000}s exceeded`);
}

async function runTests() {
    console.log('🧬 Starting Asili Frontend Tests...\n');
    
    const browser = await puppeteer.launch({ 
        headless: false,
        devtools: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--unlimited-storage',
            '--disable-storage-quota-enforcement'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // Close the default about:blank page and use our new page
        const pages = await browser.pages();
        if (pages.length > 1) {
            await pages[0].close();
        }
        
        // Increase storage quota
        await page.evaluateOnNewDocument(() => {
            // Override storage quota
            Object.defineProperty(navigator, 'storage', {
                value: {
                    estimate: () => Promise.resolve({ quota: 1024 * 1024 * 1024 }) // 1GB
                }
            });
        });
        
        // Enable console logging from the page (only on content change)
        let lastLog = '';
        page.on('console', msg => {
            const text = msg.text();
            if (text !== lastLog) {
                console.log('PAGE LOG:', text);
                lastLog = text;
            }
        });
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        
        console.log('📂 Testing DNA file loading and storage...');
        await testDNAFileLoading(page);
        
        console.log('\n🧮 Testing Type 2 Diabetes calculation...');
        await testDiabetesCalculation(page);
        
        console.log('\n💾 Testing local storage persistence...');
        await testStoragePersistence(page);
        
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

async function testDNAFileLoading(page) {
    await page.goto(BASE_URL);
    
    // Clear existing data first
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    
    console.log('  🧹 Cleared existing data');
    
    // Wait for the asili-app component to load
    await page.waitForSelector('asili-app', { timeout: 10000 });
    
    // Wait for dropdown to be populated with options
    await page.waitForFunction(() => {
        const app = document.querySelector('asili-app');
        const uploader = app?.shadowRoot?.querySelector('dna-uploader');
        const selector = uploader?.shadowRoot?.getElementById('individualSelector');
        return selector && selector.options.length > 1; // Should have "Select individual..." + "Add Individual"
    }, { timeout: 10000 });
    
    console.log('  ⏳ Components loaded and ready');
    
    // Access the shadow DOM and select "Add Individual" from dropdown
    const uploadTriggered = await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const uploader = app.shadowRoot.querySelector('dna-uploader');
        if (!uploader || !uploader.shadowRoot) return false;
        
        const selector = uploader.shadowRoot.getElementById('individualSelector');
        if (!selector) return false;
        
        // Select the "Add Individual" option
        selector.value = 'add-new';
        selector.dispatchEvent(new Event('change'));
        return true;
    });
    
    if (!uploadTriggered) {
        throw new Error('Could not trigger file upload via dropdown');
    }
    
    console.log('  📋 Selected "Add Individual" from dropdown');
    
    // The file input should now be triggered, upload the file
    const fileInput = await page.evaluateHandle(() => {
        const app = document.querySelector('asili-app');
        const uploader = app.shadowRoot.querySelector('dna-uploader');
        return uploader.shadowRoot.getElementById('fileInput');
    });
    
    await fileInput.uploadFile(TEST_DNA_FILE);
    console.log('  📁 DNA file uploaded');
    
    // Wait a moment for file dialog to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try multiple methods to dismiss file dialog
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Click somewhere on the page to ensure focus
    await page.click('body');
    
    // Check if file was actually received
    const fileReceived = await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const uploader = app.shadowRoot.querySelector('dna-uploader');
        const fileInput = uploader.shadowRoot.getElementById('fileInput');
        console.log('File input files:', fileInput.files.length);
        console.log('Selected file:', uploader.selectedFile);
        return fileInput.files.length > 0;
    });
    
    if (!fileReceived) {
        throw new Error('File upload failed - no file received');
    }
    
    // Wait for name input to appear and fill it
    await page.waitForFunction(() => {
        const app = document.querySelector('asili-app');
        const uploader = app?.shadowRoot?.querySelector('dna-uploader');
        const nameInput = uploader?.shadowRoot?.getElementById('nameInput');
        return nameInput && nameInput.style.display !== 'none';
    }, { timeout: 5000 });
    
    // Fill in the individual name
    await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const uploader = app.shadowRoot.querySelector('dna-uploader');
        const nameField = uploader.shadowRoot.getElementById('nameField');
        nameField.value = 'Test Individual';
    });
    
    console.log('  ✏️  Entered individual name');
    
    // Click the import button
    await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const uploader = app.shadowRoot.querySelector('dna-uploader');
        const importBtn = uploader.shadowRoot.getElementById('importBtn');
        importBtn.click();
    });
    
    console.log('  🚀 Started import process');
    
    // Add debugging to see what's happening
    await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const uploader = app.shadowRoot.querySelector('dna-uploader');
        const stats = uploader.shadowRoot.getElementById('stats');
        console.log('Current stats text:', stats.textContent);
        console.log('Upload state:', uploader.uploadState);
    });
    
    // Wait for import to complete by monitoring the stats text
    await page.waitForFunction(() => {
        const app = document.querySelector('asili-app');
        const uploader = app?.shadowRoot?.querySelector('dna-uploader');
        const stats = uploader?.shadowRoot?.getElementById('stats');
        console.log('Waiting... stats:', stats?.textContent);
        return stats && (stats.textContent.includes('variants loaded') || stats.textContent.includes('Error'));
    }, { timeout: 120000 }); // Increased to 2 minutes
    
    const variantCount = await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const uploader = app.shadowRoot.querySelector('dna-uploader');
        const stats = uploader.shadowRoot.getElementById('stats');
        const match = stats.textContent.match(/([\d,]+)\s+variants loaded/);
        return match ? match[1] : 'unknown';
    });
    
    console.log(`  ✅ DNA file processed with ${variantCount} variants`);
}

async function testDiabetesCalculation(page) {
    // Look for diabetes calculation button in shadow DOM
    const diabetesButtonFound = await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const dashboard = app.shadowRoot.querySelector('risk-dashboard');
        if (!dashboard || !dashboard.shadowRoot) return false;
        
        // Look for diabetes trait card
        const cards = dashboard.shadowRoot.querySelectorAll('.trait-card');
        for (const card of cards) {
            const traitName = card.querySelector('.trait-name');
            if (traitName && traitName.textContent.toLowerCase().includes('diabetes')) {
                const button = card.querySelector('.analyze-btn');
                if (button) {
                    button.click();
                    return true;
                }
            }
        }
        return false;
    });
    
    if (!diabetesButtonFound) {
        throw new Error('Could not find diabetes calculation button in risk dashboard');
    }
    
    console.log('  🖱️  Clicked diabetes calculation button');
    
    // Monitor for status updates in button text and completion
    await waitForProgressWithTimeout(page, () => {
        const app = document.querySelector('asili-app');
        const dashboard = app?.shadowRoot?.querySelector('risk-dashboard');
        if (!dashboard?.shadowRoot) return false;
        
        // Check if any diabetes card shows results (no analyze button)
        const cards = dashboard.shadowRoot.querySelectorAll('.trait-card');
        for (const card of cards) {
            const traitName = card.querySelector('.trait-name');
            if (traitName && traitName.textContent.toLowerCase().includes('diabetes')) {
                const button = card.querySelector('.analyze-btn');
                const riskScore = card.querySelector('.risk-score');
                return !button && riskScore; // No button means calculation complete
            }
        }
        return false;
    }, () => {
        const app = document.querySelector('asili-app');
        const dashboard = app?.shadowRoot?.querySelector('risk-dashboard');
        if (!dashboard?.shadowRoot) return null;
        
        // Check button text for progress
        const cards = dashboard.shadowRoot.querySelectorAll('.trait-card');
        for (const card of cards) {
            const traitName = card.querySelector('.trait-name');
            if (traitName && traitName.textContent.toLowerCase().includes('diabetes')) {
                const button = card.querySelector('.analyze-btn');
                if (button && button.textContent !== 'Calculate Risk') {
                    return button.textContent;
                }
            }
        }
        return null;
    }, 120000, 60000);
    
    // Get results from the completed card
    const result = await page.evaluate(() => {
        const app = document.querySelector('asili-app');
        const dashboard = app?.shadowRoot?.querySelector('risk-dashboard');
        if (!dashboard?.shadowRoot) return null;
        
        const cards = dashboard.shadowRoot.querySelectorAll('.trait-card');
        for (const card of cards) {
            const traitName = card.querySelector('.trait-name');
            if (traitName && traitName.textContent.toLowerCase().includes('diabetes')) {
                const riskScore = card.querySelector('.risk-score');
                const riskLevel = card.querySelector('.risk-level');
                const stats = card.querySelector('.trait-stats');
                
                if (riskScore) {
                    const statsText = stats ? stats.textContent : '';
                    const matchedMatch = statsText.match(/(\d+)\s+matched/);
                    const totalMatch = statsText.match(/of\s+([\d,]+)\s+variants/);
                    
                    return {
                        riskScore: riskScore.textContent,
                        riskLevel: riskLevel ? riskLevel.textContent : 'N/A',
                        matchedVariants: matchedMatch ? matchedMatch[1] : 'N/A',
                        totalVariants: totalMatch ? totalMatch[1] : 'N/A',
                        source: 'DOM'
                    };
                }
            }
        }
        return null;
    });
    
    if (!result) {
        throw new Error('No diabetes calculation result found');
    }
    
    console.log(`  📈 Risk Score: ${result.riskScore} (${result.riskLevel})`);
    console.log(`  🧬 Matched Variants: ${result.matchedVariants}`);
    console.log(`  📊 Total Variants: ${result.totalVariants}`);
}

async function testStoragePersistence(page) {
    // Get current storage state
    const beforeReload = await page.evaluate(() => ({
        dnaData: !!localStorage.getItem('dna_processed_variants'),
        diabetesResult: !!localStorage.getItem('trait_results_diabetes_type2'),
        uploadTime: localStorage.getItem('dna_upload_timestamp')
    }));
    
    console.log('  💾 Before reload - DNA data:', beforeReload.dnaData, 'Results:', beforeReload.diabetesResult);
    
    // Reload page to test persistence
    await page.reload();
    
    const afterReload = await page.evaluate(() => ({
        dnaData: !!localStorage.getItem('dna_processed_variants'),
        diabetesResult: !!localStorage.getItem('trait_results_diabetes_type2'),
        uploadTime: localStorage.getItem('dna_upload_timestamp')
    }));
    
    console.log('  🔄 After reload - DNA data:', afterReload.dnaData, 'Results:', afterReload.diabetesResult);
    
    if (!afterReload.dnaData || !afterReload.diabetesResult) {
        throw new Error('Data not persisted after page reload');
    }
    
    if (beforeReload.uploadTime !== afterReload.uploadTime) {
        throw new Error('Upload timestamp changed after reload');
    }
    
    console.log('  ✅ All data persisted correctly across page reload');
}

runTests().catch(console.error);