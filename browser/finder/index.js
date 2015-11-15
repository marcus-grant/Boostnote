import React, { PropTypes } from 'react'
import ReactDOM from 'react-dom'
import { connect, Provider } from 'react-redux'
import reducer from './reducer'
import { createStore } from 'redux'
import FinderInput from './FinderInput'
import FinderList from './FinderList'
import FinderDetail from './FinderDetail'
import { selectArticle, searchArticle, refreshData } from './actions'
import _ from 'lodash'
import activityRecord from 'boost/activityRecord'

import remote from 'remote'
var hideFinder = remote.getGlobal('hideFinder')
import clipboard from 'clipboard'

var notifier = require('node-notifier')
var path = require('path')
function getIconPath () {
  return path.resolve(global.__dirname, '../../resources/favicon-230x230.png')
}

require('../styles/finder/index.styl')

const FOLDER_FILTER = 'FOLDER_FILTER'
const FOLDER_EXACT_FILTER = 'FOLDER_EXACT_FILTER'
const TEXT_FILTER = 'TEXT_FILTER'
const TAG_FILTER = 'TAG_FILTER'

class FinderMain extends React.Component {
  constructor (props) {
    super(props)
  }

  componentDidMount () {
    ReactDOM.findDOMNode(this.refs.finderInput.refs.input).focus()
  }

  handleClick (e) {
    ReactDOM.findDOMNode(this.refs.finderInput.refs.input).focus()
  }

  handleKeyDown (e) {
    if (e.keyCode === 38) {
      this.selectPrevious()
      e.preventDefault()
    }

    if (e.keyCode === 40) {
      this.selectNext()
      e.preventDefault()
    }

    if (e.keyCode === 13) {
      this.saveToClipboard()
      e.preventDefault()
    }
    if (e.keyCode === 27) {
      hideFinder()
      e.preventDefault()
    }
  }

  saveToClipboard () {
    let { activeArticle } = this.props
    clipboard.writeText(activeArticle.content)
    activityRecord.emit('FINDER_COPY')

    notifier.notify({
      icon: getIconPath(),
      'title': 'Saved to Clipboard!',
      'message': 'Paste it wherever you want!'
    })
    hideFinder()
  }

  handleSearchChange (e) {
    let { dispatch } = this.props

    dispatch(searchArticle(e.target.value))
  }

  selectArticle (article) {
    this.setState({currentArticle: article})
  }

  selectPrevious () {
    let { activeArticle, dispatch } = this.props
    let index = this.refs.finderList.props.articles.indexOf(activeArticle)
    let previousArticle = this.refs.finderList.props.articles[index - 1]
    if (previousArticle != null) dispatch(selectArticle(previousArticle.key))
  }

  selectNext () {
    let { activeArticle, dispatch } = this.props
    let index = this.refs.finderList.props.articles.indexOf(activeArticle)
    let previousArticle = this.refs.finderList.props.articles[index + 1]
    if (previousArticle != null) dispatch(selectArticle(previousArticle.key))
  }

  render () {
    let { articles, activeArticle, status, dispatch } = this.props
    let saveToClipboard = () => this.saveToClipboard()
    return (
      <div onClick={e => this.handleClick(e)} onKeyDown={e => this.handleKeyDown(e)} className='Finder'>
        <FinderInput
          handleSearchChange={e => this.handleSearchChange(e)}
          ref='finderInput'
          onChange={this.handleChange}
          value={status.search}
        />
        <FinderList
          ref='finderList'
          activeArticle={activeArticle}
          articles={articles}
          dispatch={dispatch}
          selectArticle={article => this.selectArticle(article)}
        />
        <FinderDetail
          activeArticle={activeArticle}
          saveToClipboard={saveToClipboard}
        />
      </div>
    )
  }
}

FinderMain.propTypes = {
  articles: PropTypes.array,
  activeArticle: PropTypes.shape({
    key: PropTypes.string,
    tags: PropTypes.array,
    title: PropTypes.string,
    content: PropTypes.string
  }),
  status: PropTypes.shape(),
  dispatch: PropTypes.func
}

// Ignore invalid key
function ignoreInvalidKey (key) {
  return key.length > 0 && !key.match(/^\/\/$/) && !key.match(/^\/$/) && !key.match(/^#$/)
}

// Build filter object by key
function buildFilter (key) {
  if (key.match(/^\/\/.+/)) {
    return {type: FOLDER_EXACT_FILTER, value: key.match(/^\/\/(.+)$/)[1]}
  }
  if (key.match(/^\/.+/)) {
    return {type: FOLDER_FILTER, value: key.match(/^\/(.+)$/)[1]}
  }
  if (key.match(/^#(.+)/)) {
    return {type: TAG_FILTER, value: key.match(/^#(.+)$/)[1]}
  }
  return {type: TEXT_FILTER, value: key}
}

function remap (state) {
  let { articles, folders, status } = state

  let filters = status.search.split(' ')
    .map(key => key.trim())
    .filter(ignoreInvalidKey)
    .map(buildFilter)

  let folderExactFilters = filters.filter(filter => filter.type === FOLDER_EXACT_FILTER)
  let folderFilters = filters.filter(filter => filter.type === FOLDER_FILTER)
  let textFilters = filters.filter(filter => filter.type === TEXT_FILTER)
  let tagFilters = filters.filter(filter => filter.type === TAG_FILTER)

  let targetFolders
  if (folders != null) {
    let exactTargetFolders = folders.filter(folder => {
      return _.find(folderExactFilters, filter => folder.name.match(new RegExp(`^${filter.value}$`)))
    })
    let fuzzyTargetFolders = folders.filter(folder => {
      return _.find(folderFilters, filter => folder.name.match(new RegExp(`^${filter.value}`)))
    })
    targetFolders = status.targetFolders = exactTargetFolders.concat(fuzzyTargetFolders)

    if (targetFolders.length > 0) {
      articles = articles.filter(article => {
        return _.findWhere(targetFolders, {key: article.FolderKey})
      })
    }

    if (textFilters.length > 0) {
      articles = textFilters.reduce((articles, textFilter) => {
        return articles.filter(article => {
          return article.title.match(new RegExp(textFilter.value, 'i')) || article.content.match(new RegExp(textFilter.value, 'i'))
        })
      }, articles)
    }

    if (tagFilters.length > 0) {
      articles = tagFilters.reduce((articles, tagFilter) => {
        return articles.filter(article => {
          return _.find(article.tags, tag => tag.match(new RegExp(tagFilter.value, 'i')))
        })
      }, articles)
    }
  }

  let activeArticle = _.findWhere(articles, {key: status.articleKey})
  if (activeArticle == null) activeArticle = articles[0]

  console.log(status.search)
  return {
    articles,
    activeArticle,
    status
  }
}

var Finder = connect(remap)(FinderMain)
var store = createStore(reducer)

window.onfocus = e => {
  store.dispatch(refreshData())
  activityRecord.emit('FINDER_OPEN')
}

ReactDOM.render((
  <Provider store={store}>
    <Finder/>
  </Provider>
), document.getElementById('content'))
