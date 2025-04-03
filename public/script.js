let video;
let socket;
let pixelSize = 2;
let sendInterval = 100;
let lastSentTime = 0;

let myColor;
let canvas, ctx;
let drawing = false;

let userId;
let userVideos = {}; // 存储所有用户的视频元素

function setup() {
  // 创建主画布
  canvas = createCanvas(320, 240);
  canvas.parent("localVideoContainer");

  // 获取绘画画布
  ctx = document.getElementById("drawingCanvas").getContext("2d");

  // 尝试访问摄像头
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
      video = createCapture(VIDEO);
      video.size(160, 120);
      video.hide();

      // 确保使用HTTPS和正确的域名
      socket = io("https://qy992.itp.io", {
        // 重要配置
        transports: ["websocket"],
        secure: true,
        withCredentials: true,

        // rejectUnauthorized: false, // 仅开发环境，生产环境应设为true或移除
      });

      // 监听欢迎消息
      socket.on("welcome", (data) => {
        userId = data.userId;
        myColor = data.color;
        showSystemMessage(data.message);
      });

      // 监听当前用户列表
      socket.on("currentUsers", (users) => {
        users.forEach((user) => {
          if (user.id !== userId) {
            initUserVideo(user.id, user.color);
          }
        });
      });

      // 监听新用户加入
      socket.on("userJoined", (user) => {
        showSystemMessage(`User ${user.id} has joined`);
        initUserVideo(user.id, user.color);
      });

      // 监听用户离开
      socket.on("userLeft", (userId) => {
        showSystemMessage(`User ${userId} has left`);
        removeUserVideo(userId);
      });

      // 监听视频数据
      socket.on("videoData", (data) => {
        if (data.sender !== userId) {
          updateUserVideo(data.sender, data.videoData, data.color);
        }
      });

      // 监听绘画数据
      socket.on("drawed", (data) => {
        if (data.id !== userId) {
          drawOnCanvas(
            data.id,
            data.startx,
            data.starty,
            data.endx,
            data.endy,
            data.color
          );
        }
      });

      // 设置绘画事件
      setupCanvas();
    })
    .catch((error) => {
      console.error("🚨 Unable to access camera:", error);
      showSystemMessage(
        "Error: Unable to access camera. Please check permissions."
      );
    });
}

function draw() {
  // 处理并显示本地视频
  processLocalVideo();

  // 发送视频数据
  let now = millis();
  if (now - lastSentTime > sendInterval) {
    sendVideoData();
    lastSentTime = now;
  }
}

// 处理并显示本地视频
function processLocalVideo() {
  background(0);
  if (!video) return;

  video.loadPixels();
  for (let y = 0; y < video.height; y += pixelSize) {
    for (let x = 0; x < video.width; x += pixelSize) {
      let index = (x + y * video.width) * 4;
      let r = video.pixels[index + 0];
      let g = video.pixels[index + 1];
      let b = video.pixels[index + 2];
      let brightness = (r + g + b) / 3;

      if (brightness < 128) {
        fill(myColor);
        noStroke();
        rect(
          x * (width / video.width),
          y * (height / video.height),
          pixelSize,
          pixelSize
        );
      }
    }
  }
}

// 发送视频数据
function sendVideoData() {
  if (!video) return;

  // 获取处理后的视频数据
  loadPixels();

  // 创建缩略图以减少数据量
  let tempCanvas = document.createElement("canvas");
  tempCanvas.width = 80;
  tempCanvas.height = 60;
  let tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(canvas.elt, 0, 0, 80, 60);

  tempCanvas.toBlob(
    (blob) => {
      let reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        socket.emit("videoData", {
          videoData: reader.result,
        });
      };
    },
    "image/jpeg",
    0.7
  );
}

// 初始化用户视频显示
function initUserVideo(userId, color) {
  let container = document.getElementById("videosContainer");

  let userVideoContainer = document.createElement("div");
  userVideoContainer.className = "user-video-container";
  userVideoContainer.id = `user-${userId}`;

  let userVideoLabel = document.createElement("div");
  userVideoLabel.className = "user-label";
  userVideoLabel.textContent = `User ${userId}`;
  userVideoLabel.style.color = color;

  let userVideoCanvas = document.createElement("canvas");
  userVideoCanvas.className = "user-video";
  userVideoCanvas.width = 320;
  userVideoCanvas.height = 240;

  userVideoContainer.appendChild(userVideoLabel);
  userVideoContainer.appendChild(userVideoCanvas);
  container.appendChild(userVideoContainer);

  userVideos[userId] = {
    element: userVideoCanvas,
    ctx: userVideoCanvas.getContext("2d"),
    color: color,
  };
}

// 更新用户视频
function updateUserVideo(userId, base64Data, color) {
  if (!userVideos[userId]) {
    initUserVideo(userId, color);
  }

  let img = new Image();
  img.onload = function () {
    userVideos[userId].ctx.clearRect(0, 0, 320, 240);
    userVideos[userId].ctx.drawImage(img, 0, 0, 320, 240);
  };
  img.src = base64Data;
}

// 移除用户视频
function removeUserVideo(userId) {
  if (userVideos[userId]) {
    let element = document.getElementById(`user-${userId}`);
    if (element) {
      element.remove();
    }
    delete userVideos[userId];
  }
}

// 显示系统消息
function showSystemMessage(message) {
  let msgContainer = document.getElementById("messages");
  let msg = document.createElement("p");
  msg.textContent = message;
  msgContainer.appendChild(msg);
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

// 初始化画布
function setupCanvas() {
  let canvas = document.getElementById("drawingCanvas");

  // 监听鼠标事件，实现绘画
  canvas.addEventListener("mousedown", startDrawing);
  canvas.addEventListener("mousemove", drawed);
  canvas.addEventListener("mouseup", stopDrawing);
  canvas.addEventListener("mouseout", stopDrawing);

  // 完成绘画并下载图片
  document
    .getElementById("finishButton")
    .addEventListener("click", finishDrawing);
}

let startx, starty;

// 开始绘画
function startDrawing(e) {
  drawing = true;
  let rect = e.target.getBoundingClientRect();
  startx = e.clientX - rect.left;
  starty = e.clientY - rect.top;
}

// 停止绘画
function stopDrawing() {
  drawing = false;
  ctx.beginPath();
}

// 在画布上绘制
function drawed(e) {
  if (!drawing) return;

  let rect = e.target.getBoundingClientRect();
  let endx = e.clientX - rect.left;
  let endy = e.clientY - rect.top;

  ctx.beginPath();
  ctx.moveTo(startx, starty);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = myColor;
  ctx.lineTo(endx, endy);
  ctx.stroke();
  ctx.closePath();

  // 发送绘画数据
  socket.emit("drawed", {
    startx: startx,
    starty: starty,
    endx: endx,
    endy: endy,
  });

  startx = endx;
  starty = endy;
}

// 在本地画布上绘制其他用户的绘画数据
function drawOnCanvas(id, startx, starty, endx, endy, color) {
  ctx.beginPath();
  ctx.lineWidth = 5;
  ctx.moveTo(startx, starty);
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineTo(endx, endy);
  ctx.stroke();
  ctx.closePath();
}

// 结束绘画，将画布导出为图片
function finishDrawing() {
  let dataUrl = document
    .getElementById("drawingCanvas")
    .toDataURL("image/jpeg");
  let link = document.createElement("a");
  link.href = dataUrl;
  link.download = "collaborative_drawing.jpg";
  link.click();
}
