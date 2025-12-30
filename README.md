# WhoRU - Anonymous 1v1 Chat Application

A modern, production-ready anonymous chat web application built with the MERN stack, featuring real-time messaging, beautiful UI/UX, and smooth animations.

## 🚀 Features

- **User Authentication**: Email verification with OTP
- **Friend Management**: Search, send/accept/decline friend requests
- **Real-time Chat**: Instant 1v1 messaging with Socket.io
- **Typing Indicators**: See when friends are typing
- **Online Status**: Real-time online/offline indicators
- **Read Receipts**: Know when messages are read
- **Beautiful UI**: Glassmorphism design with Framer Motion animations
- **Responsive**: Mobile-first design that works on all devices

## 🛠️ Tech Stack

### Backend
- Node.js + Express.js
- MongoDB + Mongoose
- Socket.io (Real-time communication)
- JWT (Authentication)
- Bcrypt (Password hashing)
- Nodemailer (Email verification)

### Frontend
- React.js
- TailwindCSS (Styling)
- Framer Motion (Animations)
- React Router DOM (Routing)
- Axios (HTTP requests)
- Socket.io-client (Real-time)
- React Hot Toast (Notifications)
- Lucide React (Icons)

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Gmail account (for OTP emails)

### Backend Setup

1. Navigate to server directory:
```bash
cd server
```

2. Install dependencies (already done):
```bash
npm install
```

3. Configure environment variables in `server/.env`:
```env
MONGO_URI=mongodb://localhost:27017/whoru
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

**Important**: To use Gmail for OTP emails:
- Enable 2-factor authentication on your Gmail account
- Generate an "App Password" from Google Account Settings
- Use the app password in `EMAIL_PASS`

4. Start the backend server:
```bash
npm run dev
```

The server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to client directory:
```bash
cd client
```

2. Install dependencies (already done):
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The app will open at `http://localhost:3000`

## 🎯 Usage

1. **Sign Up**: Create an account with username, email, and password
2. **Verify Email**: Enter the 6-digit OTP sent to your email
3. **Add Friends**: Search for users and send friend requests
4. **Accept Requests**: Check pending requests and accept them
5. **Start Chatting**: Select a friend and start messaging in real-time!

## 📁 Project Structure

```
whoru/
├── server/
│   ├── config/          # Database configuration
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── middleware/      # Auth middleware
│   ├── utils/           # Utilities (email sender)
│   ├── socket/          # Socket.io handlers
│   ├── .env             # Environment variables
│   └── server.js        # Express server
│
└── client/
    ├── public/
    └── src/
        ├── components/  # React components
        │   ├── auth/    # Login, Signup, VerifyOTP
        │   ├── chat/    # Chat components
        │   ├── friends/ # Friends management
        │   └── layout/  # Navbar, Sidebar
        ├── context/     # React Context (Auth)
        ├── pages/       # Page components
        ├── services/    # API & Socket services
        └── App.js       # Main app with routing
```

## 🔐 Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Email verification with OTP
- Protected API routes
- Input validation
- CORS configuration

## 🎨 UI/UX Features

- Glassmorphism design
- Smooth Framer Motion animations
- Gradient text and buttons
- Hover and tap effects
- Loading states
- Toast notifications
- Responsive layout
- Auto-scroll in chat

## 🚀 Deployment

### Backend (Railway/Heroku/Render)
1. Set environment variables
2. Ensure MongoDB is accessible
3. Deploy with `npm start`

### Frontend (Vercel/Netlify)
1. Build: `npm run build`
2. Deploy the `build` folder
3. Set environment variables for API URLs

## 🐛 Troubleshooting

### Backend Issues
- **MongoDB Connection Error**: Check if MongoDB is running and MONGO_URI is correct
- **Email Not Sending**: Verify Gmail app password and EMAIL_USER/EMAIL_PASS

### Frontend Issues
- **API Connection Failed**: Ensure backend is running on port 5000
- **Socket Not Connecting**: Check SOCKET_URL in client/.env

## 📝 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/login` - Login user
- `POST /api/auth/resend-otp` - Resend OTP
- `GET /api/auth/me` - Get current user

### Friends
- `GET /api/friends/search?query=username` - Search users
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests` - Get pending requests
- `PUT /api/friends/request/:id/accept` - Accept request
- `PUT /api/friends/request/:id/decline` - Decline request
- `GET /api/friends` - Get all friends

### Chat
- `GET /api/chat/messages/:friendId` - Get chat history
- `PUT /api/chat/messages/:messageId/read` - Mark as read
- `GET /api/chat/unread-count/:friendId` - Get unread count

## 🔌 Socket.io Events

### Client → Server
- `join` - Join with userId
- `send_message` - Send message
- `typing` - Start typing
- `stop_typing` - Stop typing
- `mark_read` - Mark message as read

### Server → Client
- `receive_message` - Receive new message
- `message_sent` - Message sent confirmation
- `user_typing` - Friend is typing
- `user_stop_typing` - Friend stopped typing
- `user_online` - Friend came online
- `user_offline` - Friend went offline
- `message_read` - Message was read
- `online_users` - List of online users

## 📄 License

MIT License - feel free to use this project for learning or personal use!

## 👨‍💻 Author

IamKobie

---

**Note**: This is a learning project. For production use, implement additional security measures, proper error handling, rate limiting, and comprehensive testing.
