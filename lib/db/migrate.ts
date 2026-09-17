import { openDb, runMigrations } from './client'

const file = process.env.CVFORGE_DB_PATH ?? './data/cvforge.db'
const { db, close } = openDb(file)
runMigrations(db)
close()
console.log(`Migrations applied to ${file}`)
