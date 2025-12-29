export class MobileDebug {
    static init() {
        if (window.innerWidth > 768) return; // Only on mobile
        
        const debug = document.createElement('div');
        debug.id = 'mobile-debug';
        debug.style.cssText = `
            position: fixed; top: 0; right: 0; width: 300px; height: 200px;
            background: rgba(0,0,0,0.8); color: white; font-size: 10px;
            overflow-y: auto; z-index: 9999; padding: 5px;
            font-family: monospace; line-height: 1.2;
        `;
        
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy';
        copyBtn.style.cssText = `
            position: absolute; top: 2px; right: 2px; padding: 2px 6px;
            font-size: 10px; background: #333; color: white; border: none;
        `;
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(debug.textContent.replace('Copy', ''));
        };
        
        debug.appendChild(copyBtn);
        document.body.appendChild(debug);
        
        const originalLog = console.log;
        console.log = (...args) => {
            originalLog(...args);
            const div = document.createElement('div');
            div.textContent = args.join(' ');
            debug.appendChild(div);
            debug.scrollTop = debug.scrollHeight;
            if (debug.children.length > 50) debug.removeChild(debug.firstChild);
        };
        
        // Toggle visibility on tap
        debug.addEventListener('click', (e) => {
            if (e.target === copyBtn) return;
            debug.style.display = debug.style.display === 'none' ? 'block' : 'none';
        });
    }
}