docker login registry.gitlab.com -u danphi
rm -rf .build
meteor build .build --architecture os.linux.x86_64
docker build -t registry.gitlab.com/danphi/dominus --platform linux/x86_64 .
docker push registry.gitlab.com/danphi/dominus
ssh dan@104.236.39.83 "cd ~/server; docker-compose pull; docker-compose up -d;"
