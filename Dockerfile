FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY curriculo /usr/share/nginx/html/curriculo
COPY dax /usr/share/nginx/html/dax
COPY excel /usr/share/nginx/html/excel
COPY fabric /usr/share/nginx/html/fabric
COPY pdf /usr/share/nginx/html/pdf
COPY powerquery /usr/share/nginx/html/powerquery
COPY pyspark /usr/share/nginx/html/pyspark
COPY sql /usr/share/nginx/html/sql
EXPOSE 8080
