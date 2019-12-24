import {
  HEADER_HEIGHT_CHANGE,
  FOOTER_HEIGHT_CHANGE,
  SHOW_ERROR_MESSAGE,
  CLEAR_ERROR_MESSAGE,
} from 'shared/actionTypes'

let scrollLockTimer

// ------------------------------------
// Actions
// ------------------------------------
export function clearErrorMessage () {
  return {
    type: CLEAR_ERROR_MESSAGE,
  }
}

export function showErrorMessage (error) {
  return {
    type: SHOW_ERROR_MESSAGE,
    error,
  }
}

export function headerHeightChange ({ height }) {
  return (dispatch, getState) => {
    if (getState().ui.headerHeight === height) return

    dispatch({
      type: HEADER_HEIGHT_CHANGE,
      payload: height,
    })
  }
}

export function setFooterHeight ({ height }) {
  return (dispatch, getState) => {
    if (getState().ui.footerHeight === height) return

    dispatch({
      type: FOOTER_HEIGHT_CHANGE,
      payload: height,
    })
  }
}

// does not dispatch anything (only affects the DOM)
export function lockScrolling (lock) {
  if (lock) {
    clearTimeout(scrollLockTimer)
    scrollLockTimer = null
    document.body.classList.add('scroll-lock')
  } else if (!scrollLockTimer) {
    scrollLockTimer = setTimeout(() => {
      scrollLockTimer = null
      document.body.classList.remove('scroll-lock')
    }, 200)
  }
}

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [HEADER_HEIGHT_CHANGE]: (state, { payload }) => ({
    ...state,
    headerHeight: payload,
  }),
  [FOOTER_HEIGHT_CHANGE]: (state, { payload }) => ({
    ...state,
    footerHeight: payload,
  }),
  [SHOW_ERROR_MESSAGE]: (state, action) => ({
    ...state,
    errorMessage: action.error,
  }),
  [CLEAR_ERROR_MESSAGE]: (state, { payload }) => ({
    ...state,
    errorMessage: null,
  }),
}

// ------------------------------------
// Reducer
// ------------------------------------
const initialState = {
  headerHeight: 0,
  footerHeight: 0,
  errorMessage: null,
}

export default function uiReducer (state = initialState, action) {
  const handler = ACTION_HANDLERS[action.type]
  const newState = handler ? handler(state, action) : state

  if (action.error) {
    return {
      ...newState,
      errorMessage: action.error,
    }
  }

  return newState
}
