// Guest identity: a name and cloak colour, generated once and kept in
// localStorage so you are the same Wanderer next visit. (Real accounts later.)

const FIRST = ['Ash', 'Brin', 'Cael', 'Dara', 'Esk', 'Fen', 'Hale', 'Ilo', 'Jory', 'Kest', 'Lune', 'Mira', 'Nox', 'Orr', 'Pell', 'Rhun', 'Sable', 'Tamsin', 'Ulla', 'Vey', 'Wren', 'Yarrow']
const SECOND = ['of the Plains', 'Stonefoot', 'Far-walker', 'the Quiet', 'Lakeborn', 'of the Ridge', 'Dustcloak', 'the Late', 'Rainward', 'Highclimb']
const CLOAKS = ['#b8352a', '#2f6f8f', '#7a8f2f', '#8f5a2f', '#6a3f8f', '#2f8f6f', '#c08a2a', '#8f2f5a', '#3f4f8f', '#d06a3a']

export interface Identity {
  name: string
  color: string
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem('titans.identity')
    if (raw) {
      const id = JSON.parse(raw) as Identity
      if (id.name && id.color) return id
    }
  } catch {
    // Private mode or blocked storage: a fresh identity each visit is fine.
  }
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  const id = { name: `${pick(FIRST)} ${pick(SECOND)}`, color: pick(CLOAKS) }
  try {
    localStorage.setItem('titans.identity', JSON.stringify(id))
  } catch {
    // ignore
  }
  return id
}
