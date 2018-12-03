---
layout: post
title: API Management in Azure - briefly.
comments: true
tags: azure function API management
excerpt_separator: <!--more-->
---

We had a task to combine two big enterprise APIs. One of them was ten years old and operated based on SOAP standard, and another one was RESTfull and working with well-known logic. Of course, as soon as we understood the need of the client, we knew that Azure API management would be an accurate tool for them.

![Archi](https://cdn-images-1.medium.com/max/800/1*ezLkH8bj_59SICLI5Yv4xw.png)
<!--more-->

# Azure API management

Here is what official docs say about it:

>Use Azure API Management as a turnkey solution for publishing APIs to external and internal customers. Quickly create consistent and modern API gateways for existing back-end services hosted anywhere, secure and protect them from abuse and overuse, and get insights into usage and health. Plus, automate and scale developer onboarding to help get your API program up and running.

Briefly - Azure API management is Gateway service (Gateway API - the name of the service with similar logic in AWS).

Easiest configuration for API management is catching incoming request and transferring as it is to our backend service. 

Logically the power of the service is the possibility to change the work-flow of the request - rules that control that behavior is called policies.

# Policy

Here is what documentation say about them:

> Policies are a powerful capability of the system that allow the publisher to change the behavior of the API through configuration. Policies are a collection of Statements that are executed sequentially on the request or response of an API. Popular Statements include format conversion from XML to JSON and call rate limiting to restrict the amount of incoming calls from a developer. Many more policies are available out of the box.
> Policy expressions can be used as attribute values or text values in any of the API Management policies, unless the policy specifies otherwise. Some policies such as the Control flow and Set variable policies are based on policy expressions. For more information, see Advanced policies and Policy expressions.

Azure docs represent a bunch of working examples on how to use policies.

One of the tasks was to send an email to an administrator that the user is created. Without touching the create user request itself, for this we used one-way request:

```xml
<send-one-way-request mode="new">
<url>{SERVICE_URI}/</url>
<method>POST</method>
<set-header name="Authorized" exists-action="override">
<value>{token}</value>
</set-header>
<set-body template="none">@(context.Request.Body.As<string>(preserveContent: true))</set-body>
</send-one-way-request>
```

So basically when API management receives the request, we send another request without caring about the result.

Of course second,  most used policy from our side was catching request and sending the response from another service.
```xml
<send-request mode="new" response-variable-name="respVariable" timeout="20" ignore-error="false">
<set-url>{SERVICE_URI}</set-url>
<set-method>POST</set-method>
<set-body template="none">@(context.Request.Body.As<string>(preserveContent: true))</set-body>
</send-request>
<return-response response-variable-name="respVariable">
<set-status code="200" reason="OK" />
<set-header name="Content-Type" exists-action="override">
<value>application/soap+xml; charset=utf-8</value>
</set-header>
<set-body>@(((IResponse)context.Variables["respVariable"]).Body.As<string>(preserveContent: true))</set-body>
</return-response>
```

This is how we used Azure API management service in our solution for merging two big enterprise APIs. 

Tell me, please, in comments how you dealt with such tasks.

{% if page.comments %} 
<div id="disqus_thread"></div>
<script>

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
  "headline": "API Management in Azure - briefly.",
  "image": [
    "https://cdn-images-1.medium.com/max/800/1*ezLkH8bj_59SICLI5Yv4xw.png",
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
  "description": "We had a task to combine two big enterprise APIs. One of them was ten years old and operated based on SOAP standard, and another one was RESTfull and working with well-known logic. Of course, as soon as we understood the need of the client, we knew that Azure API management would be an accurate tool for them."
}
</script>
