docker login registry.gitlab.com -u danphi
rm -rf .build
meteor build .build --architecture os.linux.x86_64
docker build -t registry.gitlab.com/danphi/dominus --platform linux/amd64 .
docker push registry.gitlab.com/danphi/dominus
ssh root@dominusgame.net "cd /shipyard/compose; docker-compose pull; docker-compose up -d; docker-compose restart nginx;"
