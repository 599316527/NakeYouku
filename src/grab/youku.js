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
    return {
        targetId,
        client
    }
}

async function getVideos(browser, channelId) {
    let url = `http://i.youku.com/i/${channelId}/videos?order=1`

    let {targetId, client} = await makeNewContext(browser)
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

    await Target.closeTarget({targetId})

    return result.result.value
}

const pcYoukuVideoInfoApiPrefix = 'http://acs.youku.com/h5/mtop.youku.play.ups.appinfo.get/1.1/'
const pcYoukuVideoInfoApiSuccessMessage = 'SUCCESS::调用成功'

async function getVideo(browser, videoId) {
    let url = `http://v.youku.com/v_show/id_${videoId}.html`

    let {targetId, client} = await makeNewContext(browser)
    let {Page, Network} = client

    let videoInfoPromise = new Promise(function (resolve, reject) {
        Network.responseReceived(async function ({requestId, response}) {
            if (!response) return
            if (!response.url.startsWith(pcYoukuVideoInfoApiPrefix)) return

            if (response.status !== 200) {
                reject(new Error('response is not ok'))
            }

            let {body, base64Encoded} = await Network.getResponseBody({ requestId })
            let content = body.substring(body.indexOf('(') + 1, body.lastIndexOf(')'))
            let data
            try {
                data = JSON.parse(content)
            }
            catch (err) {
                console.log(err)
                reject(new Error('Can not parse response data'))
            }
            if (data.ret && data.ret[0] && data.ret[0] === pcYoukuVideoInfoApiSuccessMessage 
                && data.data && data.data.data) {
                resolve(data.data.data)
            }
            else {
                console.log(JSON.stringify(data))
                reject(new Error('response is not matched'))
            }
        });
    })

    await Network.enable()
    await Page.enable()

    await Page.navigate({url});
    await Page.loadEventFired();

    let video
    try {
        video  = await Promise.race([
            videoInfoPromise,
            new Promise(function (resolve, reject) {
                setTimeout(function () {
                    reject(new Error('Timeout of waitting for response'))
                }, 2000)
            })
        ])
    }
    catch(err) {
        await Target.closeTarget({targetId})
        return Promise.reject(err)
    }

    await Target.closeTarget({targetId})
    return video
}



