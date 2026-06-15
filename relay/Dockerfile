FROM denoland/deno:latest

WORKDIR /app
COPY main.ts .

# Warm the module cache at build time.
RUN deno cache main.ts

EXPOSE 8000
CMD ["run", "--allow-net", "--allow-env", "main.ts"]
