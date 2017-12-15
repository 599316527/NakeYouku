const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const {SERVER_PORT} = require('./constant')
const grabRouter = require('./grab/router')

app.use(bodyParser.urlencoded({ extended: true }))


module.exports = function (browser) {

    app.use('/grab', grabRouter);

    app.use(function (err, req, res) {
        console.error(err)
        res.sendStatus(500).end()
    })

    app.listen(SERVER_PORT, function () {
        console.log(`app listening on port ${SERVER_PORT}!`)
    })
}

