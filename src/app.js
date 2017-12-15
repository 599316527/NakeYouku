const chromeLauncher = require('chrome-launcher')
const CDP = require('chrome-remote-interface')
const runServer = require('./server')
const {CHROME_DEBUGGER_PORT} = require('./constant')



async function main() {

const chrome = await chromeLauncher.launch({
    port: CHROME_DEBUGGER_PORT,
    chromeFlags: [
        '--window-size=1280,768',
        '--disable-gpu',
        '--headless'
    ]
})

console.log(`Chrome debuggable on port: ${chrome.port}`)

const protocol = await CDP({port: chrome.port});
global.browser = protocol

runServer(protocol)

}

main()

