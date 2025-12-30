# 🚀 WhoRU - Quick Start Guide

## Prerequisites

Before you start, make sure you have:
1. **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
2. **MongoDB** - Choose one:
   - Local MongoDB - [Download](https://www.mongodb.com/try/download/community)
   - MongoDB Atlas (Cloud) - [Sign up free](https://www.mongodb.com/cloud/atlas/register)
3. **Gmail Account** - For sending OTP emails

## Step-by-Step Setup

### 1️⃣ Install MongoDB (if using local)

**Windows:**
```bash
# Download from: https://www.mongodb.com/try/download/community
# Run installer and follow wizard
# MongoDB will run as a service automatically
```

**Mac:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux:**
```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
```

**Or use MongoDB Atlas (Cloud - Recommended for beginners):**
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create free cluster
3. Get connection string
4. Replace MONGO_URI in server/.env

### 2️⃣ Setup Gmail App Password

1. Go to your Google Account: https://myaccount.google.com/
2. Click "Security" → "2-Step Verification" → Enable it
3. Go back to Security → "App passwords"
4. Select "Mail" and "Other" (name it "WhoRU")
5. Copy the 16-character password
6. Use this in `EMAIL_PASS` in server/.env

### 3️⃣ Configure Backend

```bash
cd server

# Copy example env file
cp .env.example .env

# Edit .env with your settings:
# - MONGO_URI (if using Atlas, paste your connection string)
# - EMAIL_USER (your Gmail)
# - EMAIL_PASS (the 16-char app password)
# - JWT_SECRET (change to something random)
```

### 4️⃣ Configure Frontend

```bash
cd client

# Copy example env file
cp .env.example .env

# Usually no changes needed if running locally
```

### 5️⃣ Start the Application

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

You should see:
```
✅ MongoDB Connected: localhost
╔═══════════════════════════════════════╗
║   🚀 WhoRU Server is running!        ║
║   📡 Port: 5000                      ║
║   🌐 Environment: development        ║
║   ⚡ Socket.io: Enabled               ║
╚═══════════════════════════════════════╝
```

**Terminal 2 - Frontend:**
```bash
cd client
npm start
```

The app will open at: http://localhost:3000

## ✅ Testing the Application

### 1. Create First User
1. Click "Sign up"
2. Enter username, email, and password
3. Check your email for OTP code
4. Enter the 6-digit code
5. You're in!

### 2. Create Second User
1. Open incognito/private browser window
2. Go to http://localhost:3000
3. Sign up with different email
4. Verify email

### 3. Add Friends
1. In first user: Click "Add Friend"
2. Search for second user's username
3. Send friend request

### 4. Accept & Chat
1. In second user: Click "Requests" tab
2. Accept the friend request
3. Click on first user's name
4. Start chatting!

## 🐛 Troubleshooting

### Backend won't start
- **Error: MongoDB connection failed**
  - Check if MongoDB is running: `mongo` or `mongosh`
  - Verify MONGO_URI in .env
  - Try MongoDB Atlas if local doesn't work

- **Error: Email not sending**
  - Double-check EMAIL_USER and EMAIL_PASS
  - Make sure you used App Password, not regular password
  - Enable "Less secure app access" is NOT needed with App Password

### Frontend won't connect
- **API Connection Error**
  - Make sure backend is running on port 5000
  - Check browser console for errors
  - Verify .env has correct API_URL

- **Socket.io not connecting**
  - Backend must be running
  - Check SOCKET_URL in client/.env
  - Look for CORS errors in console

### Can't receive OTP
- Check spam folder
- Verify Gmail app password is correct
- Check backend terminal for email sending logs
- Try resending OTP

## 📱 Features to Test

- [ ] Sign up with email verification
- [ ] Login/Logout
- [ ] Search for users
- [ ] Send friend request
- [ ] Accept/Decline friend request
- [ ] Send message
- [ ] Receive message in real-time
- [ ] Typing indicator
- [ ] Read receipts
- [ ] Online/offline status

## 🎨 UI Features

- Beautiful glassmorphism design
- Smooth animations with Framer Motion
- Gradient text and buttons
- Responsive layout (try on mobile!)
- Toast notifications
- Loading states

## 🔧 Development Tips

### Hot Reload
- Backend uses `nodemon` - auto-restarts on file changes
- Frontend uses Create React App - auto-refreshes on changes

### Clear Database (if needed)
```bash
mongo
use whoru
db.dropDatabase()
```

### View Logs
- Backend: Check terminal running `npm run dev`
- Frontend: Browser DevTools Console (F12)

### Test Socket.io
- Open browser DevTools → Network → WS (WebSocket)
- Look for Socket.io connection

## 🚀 Next Steps

1. **Customize**: Change colors in tailwind.config.js
2. **Deploy**: Deploy to Vercel (frontend) and Railway (backend)
3. **Enhance**: Add image uploads, voice messages, groups
4. **Scale**: Add Redis for caching, rate limiting

## 📚 Resources

- [React Docs](https://react.dev/)
- [Express.js Guide](https://expressjs.com/)
- [Socket.io Docs](https://socket.io/docs/)
- [MongoDB Tutorial](https://www.mongodb.com/docs/)
- [TailwindCSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)

## 💡 Tips

- Use Chrome DevTools for debugging
- Keep both terminals open to see logs
- Test with 2 different browsers or incognito
- Check README.md for API documentation

---

**Need Help?** Check the main README.md for detailed API docs and troubleshooting!

Enjoy building with WhoRU! 🎉
