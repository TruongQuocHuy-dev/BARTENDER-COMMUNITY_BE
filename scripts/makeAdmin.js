#!/usr/bin/env node
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

dotenv.config({ path: join(process.cwd(), '.env') })

const usage = () => {
  console.log('Usage: node scripts/makeAdmin.js --email someone@example.com')
  process.exit(1)
}

const args = process.argv.slice(2)
let email
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email') email = args[i + 1]
}

if (!email) usage()

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const user = await User.findOne({ email })
    if (!user) {
      console.error('User not found:', email)
      process.exit(1)
    }

    user.role = 'admin'
    user.isVerified = true
    await user.save()
    console.log('User updated to admin:', user.email)
    process.exit(0)
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  }
}

run()
import dotenv from 'dotenv'
dotenv.config()

import { connectDB } from '../utils/connectDB.js'
import User from '../models/User.js'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: node scripts/makeAdmin.js <email>')
    process.exit(1)
  }

  await connectDB()

  const user = await User.findOne({ email })
  if (!user) {
    console.error('User not found:', email)
    process.exit(1)
  }

  user.role = 'admin'
  // set isAdmin flag too, some middleware checks isAdmin
  user.isAdmin = true
  await user.save()

  console.log('Updated user to admin:', email)
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
