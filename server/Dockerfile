FROM node:22-alpine

WORKDIR /app

COPY package.json index.js ./

# No deps to install — index.js uses only the Node stdlib (http + fetch).
# Keeping the image dep-free means faster startup in Glama's sandbox and
# fewer moving pieces to break the introspection check.

EXPOSE 3333

ENV NODE_ENV=production \
    PORT=3333 \
    CABGO_UPSTREAM_MCP_URL=https://www.cabgo.app/mcp

USER node

CMD ["node", "index.js"]
