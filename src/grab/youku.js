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
    // 封装一下关闭接口
    client.kloseTarget = function () {
        return Target.closeTarget({targetId})
    }
    return client
}

async function getVideos(browser, channelId) {
    let url = `http://i.youku.com/i/${channelId}/videos?order=1`

    let client = await makeNewContext(browser)
    let {Page, Runtime} = client
    await Page.enable()

    await Page.navigate({url});
    await Page.loadEventFired();

    const expression = `
        Array.from(document.querySelectorAll('.container .YK-box .items > div.va'))
            .map(item => {
                let img = item.querySelector('img')
                let anchor = item.querySelector('a')
                let time = item.querySelector('.v-time')
                let pubDate =  item.querySelector('.v-publishtime')

                return {
                    album: img.src,
                    title: anchor.title,
                    href: anchor.href,
                    duration: time.innerText.trim(),
                    pubDate: pubDate.innerText.trim()
                }
            })
    `

    const result = await Runtime.evaluate({
        expression,
        returnByValue: true
    });
    // console.log(result)

    await client.kloseTarget()

    let items = []
    if (result.result.value) {
        items = result.result.value.map(function (item) {
            item.duration = parseTimeStr(item.duration)
            item.pubDate = parseSmartDate(item.pubDate)
            return item
        })
    }

    return items
}

const pcYoukuVideoInfoApiPrefix = 'http://acs.youku.com/h5/mtop.youku.play.ups.appinfo.get/1.1/'
const pcYoukuVideoInfoApiSuccessMessage = 'SUCCESS::调用成功'

async function getVideo(browser, videoId) {
    let url = `http://v.youku.com/v_show/id_${videoId}.html`

    let client = await makeNewContext(browser)
    let {Page, Network} = client

    let videoInfo
    let videoInfoError
    Network.responseReceived(async function ({requestId, response}) {
        if (!response) return
        if (!response.url.startsWith(pcYoukuVideoInfoApiPrefix)) return

        // 不能用 new Promise 包一层，然后在最后 Promise.race 并一个超时 Promise 的方式来搞
        // 因为 resject 只能触发一次，而实际上可能存在第一次令牌失效，重发后又好了的情况
        // 如果用 Promise，第一次错误后就触发了 reject
        // 所以这里如果拿到了视频信息就先存，然后在最后轮询，如果有视频信息成功。
        // 如果超时就失败，返回最后一次响应出错的消息，如果没有错误消息就是超时
        // 这样做的问题就是，不知道 responseReceiver 怎么算失败，如果一直没有成功，就得等超时出错

        if (response.status !== 200) {
            videoInfoError = 'response is not ok'
        }

        let {body, base64Encoded} = await Network.getResponseBody({ requestId })
        let content = body.substring(body.indexOf('(') + 1, body.lastIndexOf(')'))
        let data
        try {
            data = JSON.parse(content)
        }
        catch (err) {
            console.log(err)
            videoInfoError = 'Can not parse response data'
        }
        if (data.ret && data.ret[0] && data.ret[0] === pcYoukuVideoInfoApiSuccessMessage 
            && data.data && data.data.data) {
            videoInfo = data.data.data
        }
        else {
            console.log(JSON.stringify(data))
            videoInfoError = 'response is not matched'
        }
    });

    await Network.enable()
    await Page.enable()

    await Page.navigate({url});
    await Page.loadEventFired();

    try {
        let videoData = await new Promise(function (resolve, reject) {
            let count = 0
            let timer = setInterval(function () {
                if (videoInfo) {
                    clearInterval(timer)
                    resolve(videoInfo)
                }
                else if (count++ > 9) {
                    clearInterval(timer)
                    reject(new Error('Fail to get video data. ' 
                        + (videoInfoError || 'time out')))
                }
            }, 200)
        })
        await client.kloseTarget()
        return videoData
    }
    catch(err) {
        await client.kloseTarget()
        return Promise.reject(err)
    }
}

const dayMatch = {
    '今天': 0,
    '昨天': -1,
    '前天': -2,
    '2天前': -3,
    '3天前': -4,
    '4天前': -5,
    '5天前': -6,
    '6天前': -7
}

function parseSmartDate(dateStr) {
    let date = new Date()
    date.setHours(0)
    date.setMinutes(0)
    date.setSeconds(0)

    let [dStr, tStr] = dateStr.split(/\s+/)

    if (dayMatch[dStr] !== undefined) {
        date.setTime(date.getTime() + 1e3 * dayMatch[dStr] * 24 * 60 * 60)
    }
    else {
        dStr.split('-').reverse().forEach(function (val, i) {
            val = parseInt(val, 10)
            switch (i) {
                case 0:
                    date.setDate(val)
                    break
                case 1:
                    date.setMonth(val - 1)
                    break
                case 2:
                    date.setFullYear(val)
                    break
            }
        })
    }

    if (tStr) {
        date.setTime(date.getTime() + 1e3 * parseTimeStr(tStr + ':0'))
    }

    return Math.floor(date.getTime() / 1e3)
}

function parseTimeStr(timeStr) {
    return timeStr.split(':').reverse().reduce(function (sum, val, i) {
        return sum + Math.pow(60, i) * parseInt(val, 10)
    }, 0)
}
