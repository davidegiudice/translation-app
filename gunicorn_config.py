bind = "unix:/tmp/gunicorn.sock"
workers = 4
worker_class = "eventlet"  # Required for SocketIO
keepalive = 120
errorlog = "/var/log/gunicorn/error.log"
accesslog = "/var/log/gunicorn/access.log" 