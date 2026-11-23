# Daily database dump to Google Cloud Storage (compose service `backup`, profile `backup`).
# pg_dump 17 also dumps older servers; keep this major version >= the server's.
FROM postgres:17-alpine

RUN apk add --no-cache rclone tzdata

COPY --chmod=755 backup.sh entrypoint.sh /usr/local/bin/

ENTRYPOINT ["entrypoint.sh"]
CMD ["schedule"]
