'use strict'

const execa = require('execa')
const moment = require('moment')

function substitute(str, o) {
  return str.replace(/\\?\{([^{}]+)\}/g, (match, name) => {
    if (match.charAt(0) === '\\') {
      return match.slice(1)
    }

    return o[name] === undefined ? '' : o[name]
  })
}

module.exports = {
  website: {
    assets: './assets',
    css: ['style.css']
  },

  filters: {
    timeFormat(time, format) {
      return moment(time).format(format || moment.defaultFormat)
    }
  },

  hooks: {
    page(page) {
      const defaults = {
        position: 'bottom',
        createTpl: 'Created by {user} at {timeStamp}',
        modifyTpl: 'Last modified by {user} at {timeStamp}',
        timeStampFormat: 'YYYY-MM-DD HH:mm:ss',
        bestBefore: 1,
        bestBeforeUnit: "years",
        noticeTpl: "More than {passed} years have passed since last update."
      }
      const bookRoot = this.resolve('')
      const pluginConfig = this.config.get('pluginsConfig')['page-freshness']
      const options = Object.assign({}, defaults, pluginConfig)

      const {position} = options
      const {createTpl} = options
      const {modifyTpl} = options
      const {timeStampFormat} = options
      const {bestBefore} = options
      const {bestBeforeUnit} = options
      const {noticeTpl} = options

      let now = moment()

      return execa
        .shell(`git log --format="%an|%at" -- "${page.rawPath}"`, {
          cwd: bookRoot
        })
        .then(ret => {
          // None commit to this file
          if (!ret.stdout) {
            this.log.debug(`none commit to file ${page.path}`)
            return page
          }

          const commits = ret.stdout.split(/\r?\n/).map(log => {
            const arr = log.split('|')
            const timeStamp = moment(arr[1] * 1000).format(timeStampFormat)

            return {
              user: arr[0],
              timestamp: timeStamp,
              timeStamp
            }
          })

          const lastCommit = commits[0]
          const firstCommit = commits.slice(-1)[0]
          const diff = now.diff(lastCommit.timestamp, bestBeforeUnit)
          const isRotten = diff >= bestBefore

          let gitAuthorContent = `<div class="page-freshness-container page-freshness-${position}">`

          if (modifyTpl) {
            const modifyMsg = substitute(modifyTpl, lastCommit)
            gitAuthorContent += `<div class="modified">${modifyMsg}</div>`
          }

          if (createTpl) {
            const createMsg = substitute(createTpl, firstCommit)
            gitAuthorContent += `<div class="created">${createMsg}</div>`
          }

          if (isRotten && noticeTpl) {
            const noticeMsg = substitute(noticeTpl, {passed:diff})
            const depWarning = `<div class="page-freshness-rotten"><span class="fa fa-warning"></span>${noticeMsg}</div>`
            let headerReg = new RegExp('(</h1>)', 'm');
            page.content = page.content.replace(headerReg, '$1' + depWarning)
          }

          gitAuthorContent += '</div>'

          if (position === 'top') {
            page.content = gitAuthorContent + page.content
          } else {
            page.content += gitAuthorContent
          }

          return page
        })
        .catch(error => {
          this.log.warn('initialize git repository and commit files firstly')
          this.log.warn(error)
          return page
        })
    }
  }
}
