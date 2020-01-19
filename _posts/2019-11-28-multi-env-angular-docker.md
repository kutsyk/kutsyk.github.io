---
layout: post
title: Angular with dynamic Backend URI in Docker-Compose
comments: true
tags: angular devops azure docker docker-compose backend multi-env
keywords:
  - angular
  - devops 
  - azure 
  - docker 
  - docker-compose 
  - backend 
  - multi-env
image: https://miro.medium.com/max/2880/1*RaY9644zkGeonLCc44IxuQ.png
excerpt_separator: <!--more-->
---
[👉 original](https://medium.com/@VKutsyk/angular-with-dynamic-backend-uri-in-docker-compose-c914d9531cf7)

![Multi-environmental Angular application with docker-compose](https://miro.medium.com/max/2880/1*RaY9644zkGeonLCc44IxuQ.png)

Hola!

Multy environmental Angular application with docker-compose

Our goals are simple — one frontend for different backends. Build once, reuse everywhere.

We did it with Angular 8 and docker-compose, and we are deploying our Angular application without rebuilding it for different backends.

Every client will own his own copy of the solution, without a centralized backend service. So our frontend should be able to change his requests endpoint dynamically during the start process.
<!--more-->

Our delivery process is next:

* Start installation script

* Start application

* Enjoy working application [🎉](https://emojipedia.org/party-popper/)

As we don’t develop a centralized backend, we need our Frontend application to be customizable for backend URI. And an important point here is that we decided to develop our Front application with Angular 8. This means that after build we will receive static files **html/css/js**, which should include backend URI.

If you worked with Angular applications you know that it’s not working from the box, so we will add our own Service, which will manage backend URI.

## Standard WebApp workflow

![WebApp workflow](https://cdn-images-1.medium.com/max/2000/1*asxMrTcNTWmkCnYJtwrefg.png)*WebApp workflow*

**0** — A user connects to a browser

**1 — **The user inputs URL and the browser asks Server for files;

**2 — **The user browser receives static files **html/css/js** which is Angular WebApp.

**3…N — **Those steps represent user interaction with WebApp, which will communicate with the backend server and build representation on the client-side with JS code.

So by default, when we deploy our WebApp to the server it has to have backend service URI hardcoded in files, which is done automatically with angular CLI during the build process.

More about the standard workflow you can find in the official documentation: [https://angular.io/guide/build](https://angular.io/guide/build)

## Multi backend Angular WebApp

Our implementation differs from original, with additional file config.json which is in assets directory and served with other angular files.

![with config.json](https://cdn-images-1.medium.com/max/2000/1*LLZc8J-KGc5KwkQLfcMuvQ.png)*with config.json*

Content of the file:

    // config.json example
    {
        "url": "[https://my_backend.uri](https://my_backend.uri)"
    }

Here is our requests stack trace for Angular WebApp

![Stacktrace of WebApp](https://cdn-images-1.medium.com/max/4560/1*ZpZcmsvZThc9kskoujU_zg.png)*Stacktrace of WebApp*

From step 1 to 8, we are downloading files needed for Angular. And on step 9 we are receiving our **config.json** which contains URL of our backend service, to which WebApp will send all requests.

## Implementation Angular

I have created file **config.teml.json** which contains next template:

    {
        "url": "[https://${SERVER_NAME}:${PORT_BACK_SSL](https://${SERVER_NAME}:${PORT_BACK_SSL)}" 
    }

Where SERVER_NAME is backend service IP or domain name and PORT_BACK_SSL is backend service port for SSL communication if needed.

Then we should create a service which will configure our variables and inject them into Angular App:

    // app-config.ts

    import { Injectable } from '[@angular/core](http://twitter.com/angular/core)';
    import { HttpClient } from '[@angular/common](http://twitter.com/angular/common)/http';

    interface Config {
      url: string;
    }

    export interface IAppConfig {
      baseUrl: string;
      baseDMUrl: string;
      baseStandardUrl: string;
      load: () => Promise<void>;
    }

    [@Injectable](http://twitter.com/Injectable)()
    export class AppConfig implements IAppConfig {
      public baseUrl: string;
      public baseDMUrl: string;
      public baseStandardUrl: string;

    constructor(private readonly http: HttpClient) {}

    public load(): Promise<void> {
        return this.http
          .get<Config>('assets/config.json')
          .toPromise()
          .then(config => {
            this.baseUrl = config.url;
          });
      }
    }

    export function initConfig(config: AppConfig): () => Promise<void> {
      return () => config.load();
    }

After, of course, we should inject this service into our **app.module.ts:**

    import { AppConfig, initConfig } from './app-config';
    import { NgModule, Inject, APP_INITIALIZER } from '[@angular/core](http://twitter.com/angular/core)';
    import { HttpClientModule } from '[@angular/common](http://twitter.com/angular/common)/http';
    import { BrowserModule } from '[@angular/platform-browser](http://twitter.com/angular/platform-browser)';
    import { BrowserAnimationsModule } from '[@angular/platform-browser](http://twitter.com/angular/platform-browser)/animations';
    import { AppComponent } from './app.component';

    [@NgModule](http://twitter.com/NgModule)({
      imports: [
        BrowserModule,
        BrowserAnimationsModule,
        HttpClientModule,
      ],
      providers: [
        AppConfig,
        {
          provide: APP_INITIALIZER,
          useFactory: initConfig,
          deps: [AppConfig],
          multi: true
        },
      ],
      declarations: [AppComponent],
     
      bootstrap: [AppComponent]
    })
    export class AppModule {
    }

As you can see we are using APP_INITIALIZER provider to initialize our AppConfig module.

APP_INITIALIZER - [https://angular.io/api/core/APP_INITIALIZER](https://angular.io/api/core/APP_INITIALIZER)

## Docker

Docker image for our angular application is used based on the Nginx:

    # base image
    FROM nginx:stable-alpine
    # clean NGINX static files
    RUN rm -rf /usr/share/nginx/html/*
    # copy WebApp built files into NGINX directory
    COPY ./dist/app /usr/share/nginx/html

## Docker Compose

Our docker-compose is key for multi-backend deployment with an Angular app:

    version: "3"

    services:
      backend:
        image: privateregistry.azurecr.io/cc/backend:develop
        expose:
          - "8080"

    frontend:
        image: privateregistry.azurecr.io/cc/frontend:develop
        ports:
          - "80:80"
          - "443:443"
          - "8080:8080"
        links:
          - backend:backend
        env_file:
          - ./backend.env
        command: /bin/sh -c "envsubst '$${SERVER_NAME},$${PORT_BACK_SSL}' < /usr/share/nginx/html/assets/config.templ.json > /usr/share/nginx/html/assets/config.json && exec nginx -g 'daemon off;'"

And the key component here is the last line:

    command: /bin/sh -c "envsubst '$${SERVER_NAME},$${PORT_BACK_SSL}' < /usr/share/nginx/html/assets/config.templ.json > /usr/share/nginx/html/assets/config.json && exec nginx -g 'daemon off;'"

Where we execute swapping of strings **${SERVER_NAME}** and **${PORT_BACK_SSL}** in **config.templ.json** and we store this file in place of **config.json **which will be used by the frontend.

Values of those variables are taken from the environment variables for **docker-compose** environment, which are initialized in the file **backend.env**

    SERVER_NAME=mydomainfortest.westeurope.cloudapp.azure.com
    PORT_BACK_SSL=443

## Automation

This moment is essential. Cause creating undefined of files that contain separately SERVER_NAME for each client, will be overcomplicated.

So I use this script, which is executed before each pull of images:

    export SERVER_NAME=$(curl [https://ipinfo.io/ip](https://ipinfo.io/ip)) && \
    echo -e "\nSERVER_NAME="$SERVER_NAME >> backend.env

Thanks for reading!

If you have other errors during deployment or you interested in another topic, please add comments and **upvote 👍**. We‘re interested in the dialog.



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
  "headline": "Angular with dynamic Backend URI in Docker-Compose.",
  "image": [
    "https://miro.medium.com/max/2880/1*RaY9644zkGeonLCc44IxuQ.png",
   ],
  "datePublished": "2018-12-03T08:00:00+08:00",
  "dateModified": "2018-12-03T09:20:00+08:00",
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
  "description": "Angular with dynamic Backend URI in Docker-Compose"
}
</script>
