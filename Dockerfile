FROM node:8
MAINTAINER Daniel Phillips (http://danp.us)

# timezone
RUN echo "Etc/UTC" > /etc/timezone && \
    dpkg-reconfigure -f noninteractive tzdata

# install packages
# libfontconfig1 is for phantomjs
# imagemagick for image resizing
# bzip2 is for phantomjs
RUN apt-get -y update && apt-get install -y --fix-missing \
    apt-utils \
    curl \
    git \
    nano \
    wget \
    libfontconfig1 \
    imagemagick \
    bzip2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    mkdir -p /opt/app

ENV DOMINUS_TEST=false HTTP_FORWARDED_COUNT=1 PORT=80 TERM=xterm

ADD .build/dominus.tar.gz /opt/app/

WORKDIR /opt/app/bundle/programs/server
RUN npm install --unsafe-perm

WORKDIR /opt/app/bundle/programs/server/npm
RUN npm rebuild

WORKDIR /opt/app/bundle
EXPOSE 80

CMD ["node", "main.js"]
