---
title: 不想读文献 WP
date: 2026-10-22
updated: 2026-10-22
categories:
  - CTF
  - Misc
tags:
  - PDF 隐写
  - SM4
  - 零宽字符
  - 小番茄混淆
  - Twin Hex
description: 不想读文献的 Misc 解题记录：从 PDF 白字隐写、SM4 和零宽字符，到图片混淆、文件尾部与 Twin Hex 解码。
typora-root-url: ..
typora-copy-images-to: ../images/buxiangduwenxian-wp
---

> ?CTF_WP/Misc/不想读文献

## 1. 阅读提示并检查白字隐写

我先大概读了一下题目提示给的ppt (现学现用嘛...),然后下载附件里面是一个pdf格式的论文,

首先我先检查一下有没有白字隐写,用浏览器打开,ctrl+a选中全部然后在前三页分别发现了两个链接 和part1,

![PDF 前三页中选中隐藏内容的第一张截图](/images/buxiangduwenxian-wp/01-image1.png)

![PDF 前三页中选中隐藏内容的第二张截图](/images/buxiangduwenxian-wp/02-image2.png)

![PDF 中隐藏的 PART1](/images/buxiangduwenxian-wp/03-image3.png)

后面的我也看了一下没东西了就.

选中后粘贴到vscode里就能看见内容了分别是<https://pan.quark.cn/s/249dadd820fd>和<https://pan.quark.cn/s/bf2c37cf14ba>,

part1的内容是

```text
PART1:fa{h51_lgt1_5
```

> HINT:图片或许只是假象,

一开始确实没看出来是栅栏密码不过后续把剩下的part解出来猜也能猜出来了.

## 2. 网盘附件与小番茄混淆

这两个网盘链接里分别是和一张明显是小番茄混淆的图片(一方面是之前做过,还有一方面是这个图片的文件名开头就是xfq

![网盘附件中的小番茄混淆图片](/images/buxiangduwenxian-wp/04-image4.jpeg)

![混淆 20 次后得到的图片及提示](/images/buxiangduwenxian-wp/05-image5.png)

所以我先处理这个混淆图,解混淆和混淆都试了很多次,最终在混淆20次后得出.

## 3. 尝试 SM4 与 AES-128

然后回到前面的加密部分,cipher里的文本只用了0-9和a-f,我就先往十六进制方向考虑,然后呢后面又跟了一个必须用上,跟了一个32个的hex字符,然后这里问了下ai,ai给出了两个方向一个是SM4,另一个试AES-128,SM4解出是如下结果(用的是这个网站<https://www.lzltool.com/SM4>)

![SM4 解密结果](/images/buxiangduwenxian-wp/06-image6.png)

然后又试了一下AES-128但没有结果,

## 4. 继续检查零宽字符

这里我看没有part3啊,结合part2的提示我复制结果导入vscode发现有零宽字符将其导入到零宽字符解码后得到(这里用的网站是<https://www.ddosi.org/unicode/>)

![零宽字符解码结果](/images/buxiangduwenxian-wp/07-image7.png)

这里的tomato也对应了后面的小番茄混淆.

## 5. 查看 PDF 文件尾部

然后回到混淆图,提示是我尾巴好像有东西.

所以使用HxD看原PDF最后一个%%EOF后面的内容找到了part5

![在 HxD 中查看 PDF 最后一个 EOF 后的内容](/images/buxiangduwenxian-wp/08-image8.png)

这里hint后的乱码 是视图问题可以导入vscode转成utf-8就好了得到

## 6. wbStego 提取与 Twin Hex 解码

至于最后一部分我想了好久实在黔驴技穷询问ai,ai说是pdf的空白字符隐写+Twin Hex套娃,让他写脚本暴力破解出来了,

在后面与出题人讲解思路时出题人提示我使用wbStego4.3open尝试得出结果是

![使用 wbStego4.3open 得到的结果](/images/buxiangduwenxian-wp/09-image9.png)

然后导入<https://www.dcode.fr/twin-hex-cipher>进行解码,进行两次解码得出最后一部分`On_y0ur_p4rt}`.

## 7. 拼接 Flag

至此六部分全部解出,

至于第一部分的乱序正解是栅栏密码,我自己按照flag的语义调整了一下顺序运出来了:)

Flag:

```text
flag{th15_15_A_13Ngthy_proCe5s_Tha7_rEqu1reS_pat1ENC3_4Nd_per53v3rANCe_On_y0ur_p4rt}
```
