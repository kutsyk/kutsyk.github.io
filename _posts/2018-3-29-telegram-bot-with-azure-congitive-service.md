---
layout: post
title: Telegram Bot for image recognition with Azure Cognitive Services
comments: true
tags: azure telegram bot javascript nodejs AI
excerpt_separator: <!--more-->
---

![Bot](https://fiverr-res.cloudinary.com/images/t_main1,q_auto,f_auto/gigs/104091794/original/bf7b9db97edc4280295f3286e31fadbb016f3466/write-telegram-bots-for-you.png)

Telegram **Bots** are simply Telegram accounts operated by software – not people – and they'll often have AI features. They can do anything – teach, play, search, broadcast, remind, connect, integrate with other services, or even pass commands to the Internet of Things.

We will create Telegram Bot that is able to recognise text using **OCR(Optical character recognition)**  from incoming image and respond with recognised text. If image doesn’t contain any text it will respond with message: `No text was detected`.
[Read in Medium] (https://medium.com/@VKutsyk/telegram-bot-for-text-recognition-2e073de2e012)

<!--more-->

## Creating a new bot
---
First of all we need register our telegram bot, for this we will use Bot that is called [BotFather](https://telegram.me/BotFather).
Use the <kbd>/newbot</kbd> command to create a new bot. The BotFather will ask you for a name and username, then generate an authorization token for your new bot.

The name of your bot is displayed in contact details and elsewhere.

The <kbd>Username</kbd> is a short name, to be used in mentions and telegram.me links. Usernames are 5-32 characters long and are case insensitive, but may only include Latin characters, numbers, and underscores. Your bot's username must end in `bot`, e.g. `tetris_bot` or `TetrisBot`.

The token is a string along the lines of <kbd>XXXXXXXXX:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX<kbd> that is required to authorize the bot and send requests to the [Bot API](https://core.telegram.org/bots/api).

## Creating a new computer vision service
---
Now we should create Microsoft Computer Vision service for text recognition. 
For that we should have [Azure](https://azure.microsoft.com/en-us/free/) account and go to your [portal](https://portal.azure.com).

1. Choose New and type “Computer vision”.
   ![alt text](/assets/img/posts/2018-3-29-telegram-bot-with-azure-congitive-service/new_comp_vision.png "Choose New and type "Computer vision"")
   
2. Choose “Computer Vision API” and configure future created service data

   ![alt text](/assets/img/posts/2018-3-29-telegram-bot-with-azure-congitive-service/conf_comp_vision.png "Choose “Computer Vision API” and configure future created service data")

Service is created and we can use it in any project we want. Here is what Computer Vision API is able to do. For working with Computer Vision API we can different languages or simply REST request:
- cURL
- C#
- ‎Java
- JavaScript
- PHP
- Python
- Ruby

## Creating a bot
---
This time we will use Javascript to create a bot and to connect to Azure.
Create a folder where you want to hold you bot project and using command line run:
<kbd>npm init</kbd>

After initialisation of NodeJs project in your folder should appear file package.json. With my configurations it looks like this:
{% highlight json %}
{
    "name": "bot",
    "version": "1.0.0",
    "description": "",
    "main": "bot.js",
    "scripts": {
        "test": "echo \"Error: no test specified\" && exit 1"
    },
    "author": "Kutsyk Vasyl",
    "license": "ISC"
}
{% endhighlight %}

Now will create **bot.js** file.
<kbd>echo >> bot.js</kbd>

Before starting to write code we need to install libraries that we will use in our bot.
{% highlight bash %}
npm install telegraf --save
npm install request --save
{% endhighlight %}

We will use ES6 with NodeJS to create bot based on Telegraf library.  Now we can proceed to codding.

Initialising variables that will be used in bot.
{% highlight javascript %}
const Telegraf = require('telegraf'),
Telegram = require('telegraf/telegram'),
session = require('telegraf/session'),
request = require('request');
{% endhighlight %}

Telegram bot configuration variables.
{% highlight javascript %}
const botKey = "XXXXXXXXX:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
bot = new Telegraf(botKey),
telegram = new Telegram(botKey);
{% endhighlight %}

Next we need get Azure service configuration variables. Be attentive with <kbd>uriBaselink</kbd>, you should take it from your service <kbd>Endpoint</kbd> property:

![](https://cdn-images-1.medium.com/max/1000/0*5s8NZmjIGhDYhEHR.)

And <kbd>azureCongitiveServiceKey</kbd> you should take from keys of your service.

![](https://cdn-images-1.medium.com/max/1000/0*U0pz-rqaCRhA_6li.)

We pass parameter to the service through url <kbd>language=unk</kbd> to be able to detect any language.
{% highlight javascript %}
const azureCongitiveServiceKey = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
uriBase = "https://northeurope.api.cognitive.microsoft.com/vision/v1.0/ocr?language=unk",
headers = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": azureCongitiveServiceKey
},
options = {
    url: uriBase,
    method: 'POST',
    headers: headers
};
{% endhighlight %}

From documentation of [ Computer Vision API](https://westcentralus.dev.cognitive.microsoft.com/docs/services/56f91f2d778daf23d8ec6739/operations/56f91f2e778daf14a499e1fc) response will be next. The OCR results in the hierarchy of region/line/word. The results include text, bounding box for regions, lines and words.

> **textAngle**  
> The angle, in degrees, of the detected text with respect to the closest horizontal or vertical direction. After rotating the input image clockwise by this angle, the recognized text lines become horizontal or vertical. In combination with the orientation property it can be used to overlay recognition results correctly on the original image, by rotating either the original image or recognition results by a suitable angle around the center of the original image. If the angle cannot be confidently detected, this property is not present. If the image contains text at different angles, only part of the text will be recognized correctly.
> ![Text angle](https://cdn-images-1.medium.com/max/1000/0*wMW3F6geNDKm6kqO.)

> orientation
> Orientation of the text recognized in the image. The value (up,down,left, or right) refers to the direction that the top of the recognized text is facing, after the image has been rotated around its center according to the detected text angle (see textAngle property).

> language
> The BCP-47 language code (user-provided or auto-detected) of the text detected in the image.

> regions
> An array of objects, where each object represents a region of recognized text. A region consists of multiple lines (e.g. a column of text in a multi-column document).

> lines
> An array of objects, where each object represents a line of recognized text.

> words
> An array of objects, where each object represents a recognized word.

> boundingBox
> Bounding box of a recognized region, line, or word, depending on the parent object. The four integers represent the x-coordinate of the left edge, the y-coordinate of the top edge, width, and height of the bounding box, in the coordinate system of the input image, after it has been rotated around its center according to the detected text angle (see textAngle property), with the origin at the top-left corner, and the y-axis pointing down.

> text
> String value of a recognized word.


{% highlight json %}
{
  "language": "en",
  "textAngle": -2.0000000000000338,
  "orientation": "Up",
  "regions": [
    {
      "boundingBox": "462,379,497,258",
      "lines": [
        {
          "boundingBox": "462,379,497,74",
          "words": [
            {
              "boundingBox": "462,379,41,73",
              "text": "A"
            },
            {
              "boundingBox": "523,379,153,73",
              "text": "GOAL"
            },
            {
              "boundingBox": "694,379,265,74",
              "text": "WITHOUT"
            }
          ]
        },
        {
          "boundingBox": "565,471,289,74",
          "words": [
            {
              "boundingBox": "565,471,41,73",
              "text": "A"
            },
            {
              "boundingBox": "626,471,150,73",
              "text": "PLAN"
            },
            {
              "boundingBox": "801,472,53,73",
              "text": "IS"
            }
          ]
        },
        {
          "boundingBox": "519,563,375,74",
          "words": [
            {
              "boundingBox": "519,563,149,74",
              "text": "JUST"
            },
            {
              "boundingBox": "683,564,41,72",
              "text": "A"
            },
            {
              "boundingBox": "741,564,153,73",
              "text": "WISH"
            }
          ]
        }
      ]
    }
  ]
}
{% endhighlight %}

So we need helper function to format content of response:
{% highlight javascript %}
const extractTextFromResponse = (response) => {
   let text = '';
   response.regions.forEach((region) => {
       region.lines.forEach((line) => {
           line.words.forEach((word) => {
               text += word.text + ' ';
           });
       });
   });
   return text;
};
{% endhighlight %}

Next step is to configure bot. We will create command <kbd>/help</kbd> that will show text the explains how to use bot.

`bot.command(‘help’, (ctx) => ctx.reply(‘This bot recognise text from image. Just send a picture for it.’));`

We should add start our bot using command:

 <kbd>bot.startPolling();</kbd>

Now we can start our bot using command 

<kbd>node bot.js</kbd>

And open our bot in telegram and send command <kbd>/help</kbd>.

 ![/help](https://cdn-images-1.medium.com/max/1000/0*LOQRQZ5GphgyahWL.)

Now we can add processing of received images. This code block is processing every received image file. Telegram creates 4 files of image with different sizes for optimising, so we take last with the best quality and with it’s id we receive straight link to file that we send to our OCR service.

{% highlight javascript %}
bot.on('photo', (ctx) => {
   let receivedPhoto = ctx.update.message.photo;
   let receivedPhotoFileId = receivedPhoto[receivedPhoto.length - 1].file_id;
   telegram.getFileLink(receivedPhotoFileId).then((fileLink) => {
       options.body = `{"url": "${fileLink}"}`;
       request(options, (err, res, body) => {
           if (!err && res.statusCode === 200) {
               let response = JSON.parse(body);
               if (response.regions.length > 0)
                   ctx.reply(extractTextFromResponse(response));
               else
                   ctx.replyWithHTML("<code>No text was detected.</code>");
           }
           else {
               ctx.replyWithHTML(`<code>${err}</code>`);
           }
       });
   }).catch((error) => ctx.replyWithHTML(`<code>${error}</code>`))
});
{% endhighlight %}

<kbd>ctx.replyWithHTML</kbd> help us format response with HTML styles, so our error response looks like this: `No text was detected.`

**Full bot code:**

{% highlight javascript %}
/** 
* This is telegram bot for recognising text from images 
* 
* @author Vasyl Kutsyk 
* @licence MIT 
**/
const Telegraf = require('telegraf'),
    Telegram = require('telegraf/telegram'),
    request = require('request');
const azureCongitiveServiceKey = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    uriBase = "https://northeurope.api.cognitive.microsoft.com/vision/v1.0/ocr?language=unk",
    headers = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": azureCongitiveServiceKey
    },
    options = {
        url: uriBase,
        method: 'POST',
        headers: headers
    };
const botKey = "XXXXXXXXX:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    bot = new Telegraf(botKey),
    telegram = new Telegram(botKey);
const extractTextFromResponse = (response) => {
    let text = '';
    response.regions.forEach((region) => {
        region.lines.forEach((line) => {
            line.words.forEach((word) => {
                text += word.text + ' ';
            });
        });
    });
    return text;
};
bot.command('help', (ctx) => ctx.reply('This bot recognise text from image. Just send a picture for it.'));
bot.on('photo', (ctx) => {
    let receivedPhoto = ctx.update.message.photo;
    let receivedPhotoFileId = receivedPhoto[receivedPhoto.length - 1].file_id;
    telegram.getFileLink(receivedPhotoFileId).then((fileLink) => {
        options.body = `{"url": "${fileLink}"}`;
        request(options, (err, res, body) => {
            if (!err && res.statusCode === 200) {
                let response = JSON.parse(body);
                if (response.regions.length > 0) ctx.reply(extractTextFromResponse(response));
                else ctx.replyWithHTML("<code>No text was detected.</code>");
            } else {
                ctx.replyWithHTML(`<code>${err}</code>`);
            }
        });
    }).catch((error) => ctx.replyWithHTML(`<code>${error}</code>`))
});
bot.startPolling();
{% endhighlight %}

## Result
---
![Sent image](https://cdn-images-1.medium.com/max/750/0*VNFFnIcn_XObUPvi.)

`Let’s get indenting and going on. some word-spacing And how about some letter-spacing, line- height, and justified text-aligment?`

Now we can push created bot to server and let it recognise text for everyone who wants.
If you have other errors during deployment or you interested in another topic, please add comments 👍.
 
I will be happy to have a dialog.

GitHub repository with all code: [https://github.com/kutsyk/TelegramTextRecogniserBot](https://github.com/kutsyk/TelegramTextRecogniserBot)

{% if page.comments %} 
<div id="disqus_thread"></div>
<script>

/**
*  RECOMMENDED CONFIGURATION VARIABLES: EDIT AND UNCOMMENT THE SECTION BELOW TO INSERT DYNAMIC VALUES FROM YOUR PLATFORM OR CMS.
*  LEARN WHY DEFINING THESE VARIABLES IS IMPORTANT: https://disqus.com/admin/universalcode/#configuration-variables*/
/*
var disqus_config = function () {
this.page.url = PAGE_URL;  // Replace PAGE_URL with your page's canonical URL variable
this.page.identifier = PAGE_IDENTIFIER; // Replace PAGE_IDENTIFIER with your page's unique identifier variable
};
*/
(function() { // DON'T EDIT BELOW THIS LINE
var d = document, s = d.createElement('script');
s.src = 'https://kutsyk.disqus.com/embed.js';
s.setAttribute('data-timestamp', +new Date());
(d.head || d.body).appendChild(s);
})();
</script>
<script id="dsq-count-scr" src="//kutsyk.disqus.com/count.js" async></script>    
<noscript>Please enable JavaScript to view the <a href="https://disqus.com/?ref_noscript">comments powered by Disqus.</a></noscript>
                            
{% endif %}

<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "NewsArticle",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://google.com/article"
  },
  "headline": "Telegram Bot for image recognition with Azure Cognitive Services",
  "image": [
    "https://kutsyk.github.io//assets/img/posts/2018-3-29-telegram-bot-with-azure-congitive-service/new_comp_vision.png",
   ],
  "datePublished": "2018-03-29T08:00:00+08:00",
  "dateModified": "2018-03-29T09:20:00+08:00",
  "author": {
    "@type": "Person",
    "name": "Vasyl Kutsyk"
  },
   "publisher": {
    "@type": "Organization",
    "name": "Kutsyk",
    "logo": {
      "@type": "ImageObject",
      "url": "https://kutsyk.github.io/images/main_photo.jpg"
    }
  },
  "description": "We will create Telegram Bot that is able to recognise text using OCR"
}
</script>
