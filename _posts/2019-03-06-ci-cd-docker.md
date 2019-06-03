---
layout: post
title: Docker Compose CI/CD in Azure DevOPs
comments: true
tags: azure devops docker docker-compose
keywords:
  - azure
  - docker
  - docker-compose
  - devops
image: https://cdn-images-1.medium.com/max/3114/1*3ftnau4BYtNSVS6cFet4Nw.png
excerpt_separator: <!--more-->
---

Hola amigos.

For one of our clients who is a very big shark in medical device development, we had to develop a solution which will be easily deployable in the cloud or on-premise infrastructure. So as you already thought we knew that we will work with containers.

There was no discussion of containerization technology so Docker first and Docker Compose second.

Next point was to define if we will have clusterization to define if we need features of Swarm or even K8. With small talks with business guys, we knew that putting any orchestration on the place won’t give any profit and all deployment will be on one machine via SSH.

<!--more-->

So what we had:

* Docker images for each service (front, back, db)

* Docker Compose (to run from one command)

* SSH machine access

* Azure DevOPs for CI/CD

As one of the points is that we will deploy on-premise infra, we generalized that to run the solution on the client side we will need only SSH access with root rights on the machine. And what we have to do is to implement continuous deployment for this in Azure DevOPs.

As in any normal process of deployment, we will have 2 steps:

* Build

* Release

## Build

Should build docker images for our application and push them into our Container Registry.

How to Build and Push docker image in Azure DevOPs you can easily find in the documentation or here — [https://docs.microsoft.com/en-us/azure/devops/pipelines/languages/docker?view=azure-devops](https://docs.microsoft.com/en-us/azure/devops/pipelines/languages/docker?view=azure-devops)

As soon as you have your image push into your container registry you can proceed to release.

An important point for our build is to remember that to proceed with our release, we have to copy docker-compose file to our server, so we can initialize proper services with images.

So at the end of the build, we should put our docker-compose file into the artifact.

![copy docker-compose to artifact](https://cdn-images-1.medium.com/max/3074/1*h_iSK--vH3azrIXES49hzA.png)*copy docker-compose to artifact*

Before creating a release, we need access to the machine on which we are going to deploy our solution.

## Configuring Environment

My container registry is Azure Container Registry and one virtual machine with Ubuntu 18.04.

Steps to do:

* Connect to machine using SSH

* Install docker

[https://docs.docker.com/install/linux/docker-ce/ubuntu/](https://docs.docker.com/install/linux/docker-ce/ubuntu/)

* test docker

* Install docker-compose

[https://docs.docker.com/compose/install/](https://docs.docker.com/compose/install/)

* test docker-compose

## Release

If you already connected to your machine, installed all the tools that you need, you can proceed in creating your Release. To run docker-compose on any remote machine we need installed docker-compose, be logged in to container registry, clean old images, execute up command and that’s it.

So our Release links to our artifact which contains docker-compose.yml and 2 tasks.

![Release flow](https://cdn-images-1.medium.com/max/2000/1*MD7gACgLowZHp5zeThfH3Q.png)*Release flow*

Tasks are next:

1. Securely copy files to the remote machine

![](https://cdn-images-1.medium.com/max/3080/1*xfHL8jp5AVjs1geRXNqOXQ.png)

2. Run shell inline on remote machine

![run shell commands](https://cdn-images-1.medium.com/max/3114/1*3ftnau4BYtNSVS6cFet4Nw.png)*run shell commands*

Here is a full script:

    docker login -u $(docker.username) -p $(docker.password) $(docker.registry) 
    cd deploy 
    docker-compose pull 
    docker-compose stop
    docker-compose rm -f
    docker-compose up -d

Where $(docker.username) -p $(docker.password) $(docker.registry) are Variables in release definition, which gives us the possibility to hide them in logs.

That’s all folks!

Our continuous deployment for docker-compose is done. Now as soon as you want to deploy a new version of your docker image to your VM, you press 2 buttons — Queue Build and Create Release.

Thanks for reading!

If you have other errors during deployment or you interested in another topic, please add comments and **upvote 👍**. We‘re interested in the dialog.
