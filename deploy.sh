#!/usr/bin/env bash
# ============================================================
# robot-dashboard 部署脚本
# 用法：
#   ./deploy.sh build     # 构建镜像
#   ./deploy.sh run       # 运行容器
#   ./deploy.sh restart   # 重新构建并重启
#   ./deploy.sh stop      # 停止容器
#   ./deploy.sh logs      # 查看日志
# ============================================================

NAME="robot-dash"
PORT="${PORT:-9900}"

case "${1:-help}" in
  build)
    docker build -t $NAME .
    ;;
  run)
    docker run -d --name $NAME -p $PORT:80 $NAME
    echo "→ http://localhost:$PORT"
    ;;
  restart)
    docker stop $NAME 2>/dev/null && docker rm $NAME 2>/dev/null
    docker build -t $NAME .
    docker run -d --name $NAME -p $PORT:80 $NAME
    echo "→ http://localhost:$PORT"
    ;;
  stop)
    docker stop $NAME 2>/dev/null && docker rm $NAME 2>/dev/null || true
    ;;
  logs)
    docker logs -f $NAME
    ;;
  *)
    echo "用法: $0 {build|run|restart|stop|logs}"
    echo ""
    echo "  首次部署:"
    echo "    docker build -t robot-dash ."
    echo "    docker run -d --name robot-dash -p 8080:80 robot-dash"
    echo ""
    echo "  更新代码后:"
    echo "    git pull"
    echo "    ./deploy.sh restart"
    echo "    # 或者手动:"
    echo "    docker build -t robot-dash ."
    echo "    docker stop robot-dash && docker rm robot-dash"
    echo "    docker run -d --name robot-dash -p 8080:80 robot-dash"
    ;;
esac
