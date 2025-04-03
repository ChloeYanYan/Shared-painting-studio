const express = require("express");
const https = require("https");
const socketIo = require("socket.io");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

const app = express();
// const server = http.createServer(app);
// const io = socketIo(server);

// 读取 SSL 证书
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/qy992.itp.io/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/qy992.itp.io/fullchain.pem"),
};

// 创建 HTTPS 服务器
const server = https.createServer(options, app);
// const io = socketIo(server);
// 配置Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "https://qy992.itp.io",
    methods: ["GET", "POST"],
    credentials: true,
    transport: ["websocket"],
  },
  // 重要：HTTPS需要的安全配置
  secure: true,
  rejectUnauthorized: false, // 仅开发环境，生产环境应该验证证书
});

// Express CORS中间件
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://qy992.itp.io");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// 存储用户信息
const users = {};

// 生成随机颜色
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

io.on("connection", (socket) => {
  const userId = uuidv4().slice(0, 8); // 生成短ID
  const userColor = getRandomColor(); // 为每个用户生成随机颜色

  // 存储用户信息
  users[socket.id] = {
    id: userId,
    color: userColor,
    socket: socket,
  };

  console.log(`📡 User ${userId} has joined`);

  // 发送欢迎消息和用户信息
  socket.emit("welcome", {
    userId: userId,
    color: userColor,
    message: `Welcome! Your ID is ${userId}`,
  });

  // 通知当前用户已有用户列表
  const userList = Object.values(users).map((user) => ({
    id: user.id,
    color: user.color,
  }));
  socket.emit("currentUsers", userList);

  // 广播新用户加入
  socket.broadcast.emit("userJoined", {
    id: userId,
    color: userColor,
  });

  // 接收客户端视频数据
  socket.on("videoData", (data) => {
    // 广播给其他用户
    socket.broadcast.emit("videoData", {
      sender: userId,
      videoData: data.videoData,
      color: userColor,
    });
  });

  // 处理绘画事件
  socket.on("drawed", (data) => {
    // 添加用户信息
    data.id = userId;
    data.color = userColor;
    // 广播给其他用户
    socket.broadcast.emit("drawed", data);
  });

  // 用户断开连接
  socket.on("disconnect", () => {
    console.log(`❌ User ${userId} has left`);

    // 广播用户离开
    io.emit("userLeft", userId);

    // 删除用户信息
    delete users[socket.id];
  });
});

// 使用静态文件
app.use(express.static(path.join(__dirname, "public")));

// 启动服务器
server.listen(443, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
