const bel = require('bel')
const csjs = require('csjs-inject')
let css
const search = require('search')
const pagination = require('pagination')
const paginationButtons = require('paginationButtons')
const makeCollectionArea = require('makeCollectionArea')

// ===== theme =====

const themes = require('themes')
setTheme(themes('darkTheme'))

function setThemeVar([key, value]) {
  const element = document.documentElement;
  element.style.setProperty(key, value);
}

function setTheme (theme) {
  let arr = Object.entries(theme)
  for (var i = 0; i < arr.length; i++) {
    setThemeVar(arr[i])
  }
}

function themeSwitch () {
  return bel`
  <div class=${css.themeSwitch}>
  <div onclick=${()=>setTheme(themes('lightTheme'))}>Light theme/</div>
  <div onclick=${()=>setTheme(themes('darkTheme'))}>/Dark theme</div>
  </div>
  `
}

require('contracts')(start)
// ===== Action =====

function clickAction() {
  location.url = ''
}

function closeAction() {
  location.url = ''
}

// window.location.href
// "http://192.168.0.163:9966/?page=1"
// window.location.origin
// "http://192.168.0.163:9966"

function start(contracts) {

  let ops = pagination(contracts)

  const collectionContainer = bel`<div>${
    makeCollectionArea(ops.currentData)
  }</div>`
  let element = bel`
    <div>
      ${themeSwitch()}
      ${search(contracts, collectionContainer, ops)}
      ${collectionContainer}
      ${paginationButtons(collectionContainer, ops)}
    </div>
  `
  document.body.appendChild(element)
}

// ===== css =====

css = csjs`
  body {
    background-color: var(--background)
  }
  .themeSwitch {
    display: flex;
    color: var(--primary)
  }
`
