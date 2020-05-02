docker login registry.gitlab.com -u danphi
rmdir /s /q ".build"
meteor build .build --architecture os.linux.x86_64
docker build -t registry.gitlab.com/danphi/dominus .
docker push registry.gitlab.com/danphi/dominus
ssh root@134.122.30.104 "cd /space; docker-compose pull; docker-compose up -d"