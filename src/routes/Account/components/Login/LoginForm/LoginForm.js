import PropTypes from 'prop-types'
import React, { Component } from 'react'
import RoomSelect from '../../Account/RoomSelect'
import './LoginForm.css'

export default class LoginForm extends Component {
  static propTypes = {
    onSubmitClick: PropTypes.func.isRequired,
  }

  username = React.createRef()
  password = React.createRef()
  handleRoomSelectRef = r => { this.roomSelect = r }

  render () {
    return (
      <form>
        <input type='email'
          autoComplete='username'
          autoFocus
          placeholder='username or email'
          ref={this.username}
          styleName='field'
        />
        <input type='password'
          autoComplete='current-password'
          placeholder='password'
          ref={this.password}
          styleName='field'
        />
        <RoomSelect onRef={this.handleRoomSelectRef} styleName='field roomId'/>

        <button onClick={this.handleSubmit} className='primary'>
          Sign In
        </button>
      </form>
    )
  }

  handleSubmit = e => {
    e.preventDefault()

    this.props.onSubmitClick({
      username: this.username.current.value.trim(),
      password: this.password.current.value,
      roomId: this.roomSelect.value,
    })
  }
}
