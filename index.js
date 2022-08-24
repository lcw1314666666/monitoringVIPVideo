const request = require('request');

const fs = require('fs')
const ytdl = require('ytdl-core');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const { getJSONList, setJSONList, transporter, scrollTimer, waitForFile, waitFileDownload } = require('./utils/index')
const { updateTop, updateAll } = require('./utils/update.js') // 更新数据
const { uploadFile } = require('./uploadVideo.js')
const { download1080VideoFile, download360VideoFile, uploadVideoCover } = require('./utils/downloadFile.js')

Date.prototype.Format = function (fmt) { // author: meizz
    var o = {
        "M+": this.getMonth() + 1, // 月份
        "d+": this.getDate(), // 日
        "h+": this.getHours(), // 小时
        "m+": this.getMinutes(), // 分
        "s+": this.getSeconds(), // 秒
        "q+": Math.floor((this.getMonth() + 3) / 3), // 季度
        "S": this.getMilliseconds() // 毫秒
    };
    if (/(y+)/.test(fmt))
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}

;(async () => {
    // let api = 'https://www.youtube.com/channel/UCMUnInmOkrWN4gof9KlhNmQ/videos?view=0&sort=dd&shelf_id=0' // 站外链接
    let api = 'https://www.youtube.com/playlist?list=PLMUs_BF93V5auQ8Bz37OsF4RqpMH38kmc' // 会员影片

    const browser = await puppeteer.launch({
        slowMo: 100,    //放慢速度
        headless: false,
        defaultViewport: {width: 1440, height: 780},
        ignoreHTTPSErrors: false, //忽略 https 报错
    });
    const page = await browser.newPage();
    await page.goto(api);

    // const videoList = await updateTop(page) // 更新最新
    // const videoList = await updateAll(page) // 全部更新
    // console.log(videoList)

    const updateTimer = setInterval(async function () {
        const newVideoList = await updateTop(page) // 获取最新视频列表
        console.log(newVideoList[0], '最新视频')

        let historyVideo = await getJSONList('newestVideo.json') // 获取历史视频

        const uploadHistory = await getJSONList('./uploadJSON.json') // 获取历史上传
        const downloadList = await getJSONList('./downloadJSON.json')


        const newVideoUrl = newVideoList[0].videoUrl // 视频链接
        const newVideoName = newVideoList[0].videoName

        // 如果有新的视频并且如果上传的文件中没有找到下载下载的文件
        if (
            historyVideo.newestVideo !== undefined && historyVideo.newestVideo !== newVideoName &&
            downloadList.findIndex((downloadItem) => downloadItem.videoUrl === newVideoList[0].videoUrl) > -1 &&
            uploadHistory.findIndex((uploadItem) => uploadItem.videoUrl === newVideoList[0].videoUrl) === -1
        ) {
            clearInterval(updateTimer) // 如果有新视频清理掉定时器

            const newVideo = downloadList.filter((downloadItem) => { // 获取已下载的最新视频数据
                return downloadItem.videoUrl === newVideoList[0].videoUrl
            })
            // 上传视频
            await uploadFile(browser, newVideo[0])

            const uploadHistory = await getJSONList('./uploadJSON.json') // 获取历史上传
            uploadHistory.push(newVideo[0])
            await setJSONList('./uploadJSON.json', uploadHistory) // 更新历史上传

            // 更新最新视频json文件
            await setJSONList('newestVideo.json', { newestVideo: newVideo[0].videoName })

            historyVideo = await getJSONList('newestVideo.json') // 更新历史信息
        }

        if (historyVideo.newestVideo !== undefined && historyVideo.newestVideo !== newVideoName) { // 有新视频
            console.log('有新视频！' + newVideoName, new Date().Format("yyyy-MM-dd hh:mm:ss"))
            clearInterval(updateTimer) // 如果有新视频清理掉定时器

            // await page.click('#video-title').then(async () => {
            //      newVideoUrl = await page.url()
            // }); // 点击获取最新视频链接

            // 发送邮箱提示
            let mailOptions = {
                from: '1820566696@qq.com', // sender address
                to: '1820566696@qq.com', // list of receivers
                subject: `老高最新视频${newVideoName}更新`, // Subject line
                // 发送text或者html格式
                // text: 'Hello world?', // plain text body
                html: `<b>${newVideoName}<span>视频地址：${newVideoUrl}</span>></b>` // html body
            };
            // 发送邮箱
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    return console.log(error);
                }
                console.log('邮件发送成功', info.messageId);
                // Message sent: <04ec7731-cc68-1ef6-303c-61b0f796b78f@qq.com>
            });

            // 下载新视频并上传
            let newVideoObj = await download360VideoFile(newVideoList[0])
            // 下载封面
            const coverObj = await uploadVideoCover(newVideoList[0])

            // 补充最新视频信息
            newVideoObj = {
                ...newVideoObj,
                ...coverObj
            }

            // 文件下载完毕 ，添加到下载记录中
            const downloadList = await getJSONList('./downloadJSON.json')
            downloadList.push(newVideoObj)
            await setJSONList('./downloadJSON.json', downloadList)

            // 上传视频
            await uploadFile(browser, newVideoObj)

            const uploadHistory = await getJSONList('./uploadJSON.json') // 获取历史上传
            uploadHistory.push(newVideoObj)
            await setJSONList('./uploadJSON.json', uploadHistory) // 更新历史上传

            // 更新最新视频json文件
            await setJSONList('newestVideo.json', { newestVideo: newVideoName })

            const new1080Video = await download1080VideoFile(newVideoList[0])

            // 发送邮箱提示
            let updata1080VideoOptions = {
                from: '1820566696@qq.com', // sender address
                to: '1820566696@qq.com', // list of receivers
                subject: `老高最新视频${newVideoName}高清版下载完毕`, // Subject line
                // 发送text或者html格式
                // text: 'Hello world?', // plain text body
                html: `<b>${newVideoName}<span>视频地址：${newVideoUrl}</span>></b>` // html body
            };
            // 发送邮箱
            transporter.sendMail(updata1080VideoOptions, (error, info) => {
                if (error) {
                    return console.log(error);
                }
                console.log('邮件发送成功', info.messageId);
                // Message sent: <04ec7731-cc68-1ef6-303c-61b0f796b78f@qq.com>
            });
            console.log(new1080Video, 'new1080Video')

            await page.goto(api) // 返回主页
            // setInterval(main, 30 * 1000)
        } else {
            console.log('无新视频,继续刷新页面！', new Date().Format("yyyy-MM-dd hh:mm:ss"))
            await page.reload()
        }
    }, 30 * 1000)
})();

// request({
//     url: 'https://www.youtube.com/channel/UCMUnInmOkrWN4gof9KlhNmQ/videos',
//     proxy: 'http://127.0.0.1:8118'
// }, function (error, response, body) {
//     console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
//     console.log(response)
// });

