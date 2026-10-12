import { io } from 'socket.io-client'
import { API_BASE } from './config'

export const socket = io(API_BASE, {
  autoConnect: false,
  reconnectionDelayMax: 2000,
})
