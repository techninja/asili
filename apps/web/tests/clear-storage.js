import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:4242';

async function clearStorage() {
    console.log('🧹 Clearing browser storage for fresh testing...');
    
    const browser = await puppeteer.launch({ headless: true });
    
    try {
        const page = await browser.newPage();
        await page.goto(BASE_URL);
        
        // Clear all localStorage
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        
        // Clear IndexedDB if used
        await page.evaluate(() => {
            if (window.indexedDB) {
                indexedDB.databases().then(databases => {
                    databases.forEach(db => {
                        indexedDB.deleteDatabase(db.name);
                    });
                });
            }
        });
        
        console.log('✅ Storage cleared successfully');
        
    } catch (error) {
        console.error('❌ Failed to clear storage:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

clearStorage();