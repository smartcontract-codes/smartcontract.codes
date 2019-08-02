const bel = require('bel')
const csjs = require('csjs-inject')
let css
const header = require('header')
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
    <span class="${css.colorplate} ${css.cubeWhite}" onclick=${()=>setTheme(themes('lightTheme'))}></span>
    <span class="${css.colorplate} ${css.cubeDark}" onclick=${()=>setTheme(themes('darkTheme'))}></span>
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
  ops.contracts = contracts

  const collectionContainer =
    bel`<div>${makeCollectionArea(ops)}</div>`

  const navigation =
    bel`<div>${paginationButtons(collectionContainer, ops)}</div>`
  ops.paginationButtons = navigation

 

  let element = bel`
    <div class=${css.wrapper}>
      ${header()}
      <div class=${css.content}>
        ${themeSwitch()}
        ${search(ops)}
        ${collectionContainer}
        ${ops.paginationButtons}
      </div>
    </div>
  `
  document.body.appendChild(element)
}

// ===== css =====

css = csjs`
  @import url('https://fonts.googleapis.com/css?family=Nunito&display=swap');
  @import url('https://fonts.googleapis.com/css?family=Inconsolata&display=swap');
  html {
    font-size: 62.5%;
  }
  body {
    height: 100%;
    font-family: var(--main-font);
    font-size: var(--text-normal);
    margin: 0;
    padding: 0;
    color: var(--body-color);
    background-color: var(--body-background);
    overflow-x: hidden;
  }
  .wrapper {
    display: grid;
    grid-template-areas:
      "header"
      "content";
    grid-template-rows: 120px 1fr;
    grid-template-columns: 100%;
    padding: var(--wrapper-padding);
  }
  .content {
    grid-area: content;
    display: grid;
    grid-template-areas:
      "themeSwitch"
      "search"
      "collection"
      "pagination"
  }
  a {
    text-decoration: none;
    color: var(--body-color);
  }
  button {
    border: none;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
  }

  .themeSwitch {
    grid-area: themeSwitch;
    justify-self: end;
    padding-bottom: 15px;
  }
  h1, h2, h3, h4, h5, h6, p {
    margin: 0;
  }
  h1 {
    font-size: var(--h1);
  }
  h2 {
    font-size: var(--h2);
  }
  h3 {
    font-size: var(--h3);
  }
  h4 {
    font-size: var(--h4);
  }
  h5 {
    font-size: var(--h5);
  }
  h6 {
    font-size: var(--h6);
  }
  img {
    width: 100%;
    height: auto;
  }
  ul, li {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .colorplate {
    display: inline-block;
    width: 20px;
    height: 20px;
    margin-left: 5px;
    border: 1px solid #888;
    border-radius: 6px;
    cursor: pointer;
  }
  .cubeWhite {
    background-color: #fff;
  }
  .cubeDark {
    background-color: #1D1D26;
  }
  svg {
    width: 100%;
    height: 100%;
  }
  @media (max-width: 420px) {
    .wrapper {
      padding: 0 20px;
    }
  }
`
