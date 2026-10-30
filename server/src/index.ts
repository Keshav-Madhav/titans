import { defineRoom, defineServer } from 'colyseus'
import { ROOM_NAME, SERVER_PORT } from '@titans/shared'
import { WorldRoom } from './world-room'

const port = Number(process.env.PORT ?? SERVER_PORT)
const server = defineServer({
  rooms: { [ROOM_NAME]: defineRoom(WorldRoom) },
})
await server.listen(port)
console.log(`titans server listening on :${port}`)
