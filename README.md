# Mikamth Translate 网页翻译插件

## 项目概述：
这是一个基于vue来编写的浏览器插件，目前初步在chrome上测试，插件主要功能是网页翻译。

## 已实现功能：
- 当前项目已具备：
  1. 右键菜单“翻译所选文本”；
  2. 自动划词翻译与右键翻译两种触发方式（默认右键方式）；
  3. 通过 options 页面配置模型 `baseUrl`、`apiKey` 并刷新选择模型；
  4. popup 页面可配置译文目标语言（通过追加短提示词实现）；
  5. options 页面可配置翻译 prompt（留空时回退默认 prompt）；
  6. 后台脚本统一请求大模型接口（OpenAI Chat Completions 兼容格式）。

## 项目架构
- src 目录：
  1. `src/main.ts`：popup 页 Vue 应用入口。
  2. `src/App.vue`：popup 页“功能中心”主界面（当前提供划词翻译方式切换、目标语言设置与快捷入口）。
  3. `src/style.css`：popup 页功能中心样式。
- 划词翻译核心:
  1. `src/content/selection-translator.ts`：内容脚本，支持自动划词翻译与接收右键菜单翻译结果展示浮层。
  2. `src/background/index.ts`：后台脚本，处理翻译请求、注册右键菜单并响应“翻译所选文本”，支持“默认/自定义 prompt + 目标语言后缀”拼接逻辑。
  3. `src/shared/config.ts`：共享配置模块，负责读取/保存模型配置、划词触发模式、目标语言与自定义翻译 prompt。
- 配置页面:
  1. `src/options/main.ts`：配置页 Vue 应用入口。
  2. `src/options/App.vue`：配置页主界面，提供 `baseUrl`、`apiKey`、模型刷新与模型选择，并在“翻译行为”模块支持配置请求超时与翻译 prompt。
  3. `src/options/style.css`：配置页样式。

## 开发中功能：
- [ ] 网页内图片翻译
- [ ] 网页截图翻译
- [ ] 全文翻译
- [ ] 全文翻译输出PDF
- [ ] 翻译内容分享
- [ ] 自动上下文语境翻译
- [ ] 常规翻译接入（有道/百度/谷歌/公益api）

## 安装方法
  1. 前往 Releases 页面。
  2. 下载最新的 plugin.zip 并解压。
  3. 打开 Chrome 浏览器，访问 chrome://extensions/。
  4. 开启右上角的 "开发者模式"。
  5. 点击 "加载已解压的扩展程序"，选择你解压出的 dist 文件夹。

## 写在最后
这个插件是我在了解Vue以及前端部分知识时和AI一同编写的项目（我知道前端现在不大行了QAQ），目前项目还处于初步开发状态，项目里面可能存在一些问题，希望大家能多多指正QAQ