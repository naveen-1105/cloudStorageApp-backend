set -e

cd /home/ubuntu/cloudStorageApp-backend

git pull
npm i

pm2 restart 4
