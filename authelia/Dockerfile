FROM authelia/authelia:latest

# 复制配置文件
COPY authelia-configuration.yml /config/configuration.yml
COPY users_database.yml /config/users_database.yml

# 设置权限
RUN chmod 644 /config/configuration.yml /config/users_database.yml

# 暴露端口
EXPOSE 9091

# 启动Authelia
CMD ["authelia", "--config=/config/configuration.yml"]