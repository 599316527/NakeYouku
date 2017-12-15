const CDP = require('chrome-remote-interface')
const {CHROME_DEBUGGER_PORT} = require('../constant')

exports.makeNewContext = makeNewContext
exports.getVideos = getVideos
exports.getVideo = getVideo

async function makeNewContext(browser, url = 'about:blank') {
    let {Target} = browser
    const {browserContextId} = await Target.createBrowserContext()
    const {targetId} = await Target.createTarget({
        url,
        browserContextId
    })
    const client = await CDP({
        port: CHROME_DEBUGGER_PORT,
        target: targetId
    })
    return client
}

async function getVideos(browser, channelId) {
    let url = `http://i.youku.com/i/${channelId}/videos?order=1`

    let client = await makeNewContext(browser)
    let {Page, Runtime} = client
    await Page.enable()

    await Page.navigate({url});
    await Page.loadEventFired();

    const expression = `Array.from(document.querySelectorAll('.container .YK-box .items .v-link a'))
                            .map(item => ({
                                href: item.href,
                                title: item.title
                            }))`

    const result = await Runtime.evaluate({
        expression,
        returnByValue: true
    });

    return result.result.value
}

const pcYoukuVideoInfoApiPrefix = 'http://acs.youku.com/h5/mtop.youku.play.ups.appinfo.get/1.1/'
const pcYoukuVideoInfoApiSuccessMessage = 'SUCCESS::调用成功'

async function getVideo(browser, videoId) {
    let url = `http://v.youku.com/v_show/id_${videoId}.html`

    let client = await makeNewContext(browser)
    let {Page, Network} = client

    let videoInfo
    Network.responseReceived(async function ({requestId, response}) {
        if (!response) return
        let url = response.url
        if (url.startsWith(pcYoukuVideoInfoApiPrefix) && response.status === 200) {
            let {body, base64Encoded} = await Network.getResponseBody({ requestId })
            let content = body.substring(body.indexOf('(') + 1, body.lastIndexOf(')'))
            let data
            try {
                data = JSON.parse(content)
            }
            catch (err) {
                console.log('Fail to parse video info', err)
                return
            }
            if (data.ret && data.ret[0] && data.ret[0] === pcYoukuVideoInfoApiSuccessMessage) {
                videoInfo = data.data && data.data.data
            }
        }
    });

    await Network.enable()
    await Page.enable()

    await Page.navigate({url});
    await Page.loadEventFired();

    return new Promise(function (resolve, reject) {
        let count = 0
        let timer = setInterval(function () {
            if (videoInfo) {
                clearInterval(timer)
                resolve(videoInfo)
            }
            else if (count++ > 9) {
                clearInterval(timer)
                reject(new Error('Fail to get video data. Time out'))
            }
        }, 200)
    })
}



