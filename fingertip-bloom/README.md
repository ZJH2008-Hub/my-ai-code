# FLORA · 指尖绽放

一个使用 Three.js、MediaPipe Hands 与 GLSL 制作的实时手势交互粒子花朵。

## 运行

项目不依赖 npm 安装包，Three.js 与 MediaPipe Hands 从 CDN 加载。需要联网加载资源。

```powershell
cd fingertip-bloom
npm run dev
```

也可以直接运行：

```powershell
node server.mjs
```

随后访问 <http://localhost:5173>。摄像头 API 要求页面通过 `localhost` 或 HTTPS 打开，不能直接双击 `index.html`。

## 操作

- 点击“启用手势”，允许浏览器访问摄像头。
- 握拳：花瓣粒子收拢成花苞。
- 张开手掌：花瓣向外舒展。
- 移动手掌或食指：花朵会产生轻微的磁场偏移、涟漪和视差。
- 未启用摄像头时：页面以自动呼吸模式展示花朵，也可用鼠标划过花朵。

## 技术要点

- 使用 MediaPipe Hands 读取 21 个手部关键点。
- 通过四指“指尖 / 掌指关节”相对手腕的距离计算连续张开程度，并做阈值映射和低通平滑。
- 花瓣、花心与星尘均由 Three.js 程序化生成，不依赖图片素材。
- 自定义 GLSL 负责花苞与盛开位置插值、分层绽放延迟、指尖磁场、闪烁和柔和点精灵。
- 摄像头画面只在浏览器本地处理，不会上传。

建议使用最新版 Chrome 或 Edge，并在光线充足、背景简单的环境中体验。
