docker login registry.gitlab.com -u danphi
docker build -t registry.gitlab.com/danphi/dominus --platform linux/amd64 .
docker push registry.gitlab.com/danphi/dominus
ssh root@dominusgame.net "cd /shipyard/compose; docker-compose pull; docker-compose up -d; docker-compose restart nginx;"