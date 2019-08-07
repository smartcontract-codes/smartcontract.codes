const csjs = require('csjs-inject')
const makePage = require('makePage')
const setTheme = require('setTheme')

module.exports = app

function app ({ contracts, themes }) {
  setTheme(themes())
  const options = { db: contracts, themes: themes.names }
  return makePage(options, action => {
    if (action.type === 'theme') return setTheme(themes(action.body))
  })
}
const css = csjs`
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
svg {
  width: 100%;
  height: 100%;
} {
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
svg {
  width: 100%;
  height: 100%;
}`
