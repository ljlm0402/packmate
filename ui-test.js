/**
 * Enhanced UI Feature Test
 */

import { SimpleUI } from './src/simple-ui.js';

async function testEnhancedUI() {
    console.log('🧪 Testing Enhanced UI Features\n');
    
    const ui = new SimpleUI();
    
    try {
        // Test intro/outro
        ui.intro('Enhanced UI Test');
        
        // Test spinner
        console.log('Testing spinner...');
        const spinner = ui.startSpinner('test', 'Processing...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        ui.stopSpinner('test', 'Processing complete');
        
        // Test progress bar
        console.log('\nTesting progress bar...');
        for (let i = 1; i <= 10; i++) {
            ui.updateProgress(i, 10);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Test note
        ui.note('Test Note', 'This is a test note message');
        
        // Skip interactive test for automation
        console.log('✅ All non-interactive UI features working');
        
        ui.outro('Enhanced UI Test Complete');
        
        ui.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ UI test failed:', error.message);
        ui.close();
        process.exit(1);
    }
}

testEnhancedUI();