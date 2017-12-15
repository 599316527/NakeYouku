const express = require('express')
const {getVideos, getVideo} = require('./youku')

const router = new express.Router()

router.post('/list', function (req, res, next) {
    let cid = req.body.cid
    if (!cid) {
        next(new Error('cid is required'))
    }
    // cid: UMzExNjk4MjM0MA==
    getVideos(browser, cid).then(function (items) {
        res.send(items).end()
    }).catch(function (err) {
        next(err)
    })
})

router.post('/video', function (req, res, next) {
    let vid = req.body.vid
    if (!vid) {
        next(new Error('vid is required'))
    }
    // vid: XMzIzNDM0NjU4OA==
    getVideo(browser, vid).then(function (item) {
        res.send(item).end()
    }).catch(function (err) {
        next(err)
    })
})

module.exports = router
