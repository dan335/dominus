docker login registry.gitlab.com -u danphi
rm -rf .build
meteor build .build --architecture os.linux.x86_64
docker build -t registry.gitlab.com/danphi/dominus .
docker push registry.gitlab.com/danphi/dominus
git add -A .
git commit -m "build"
git push
