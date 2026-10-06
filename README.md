# WNACG 搜索分页修复

Tampermonkey 用户脚本，自动修复 WNACG 搜索页面 `p≥418` 时缺失的 `c` 参数，实现链式爬取并自动跳转。

## 功能

- `p≤417`：不干预，正常访问
- `p≥418` 且无 `c`：从安全边界 `417` 开始链式爬取分页器中的 `c` 值，自动跳转
- 支持缓存：利用已爬取的页码继续迭代，无需每次都从 417 重新开始
- 轻量提示：迭代时右上角显示进度，成功/失败后自动消失

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 新建脚本，替换为 `wnacg-smartfix-v3.user.js` 内容
3. 保存并启用

## 使用

在地址栏访问：

```
https://www.wnacg.com/search/index.php?q=ntr&m=&syn=yes&f=_all&s=create_time_DESC&p=500
```

- 若 `p≤417`：页面正常加载
- 若 `p≥418`：脚本自动获取 `c` 并跳转，无需手动操作

## 存储

- `c` 值缓存保存在 Tampermonkey 的 `GM_getValue/GM_setValue` 中
- 重启浏览器/更新脚本后缓存保留
- 清除浏览器数据/卸载扩展会导致缓存丢失
