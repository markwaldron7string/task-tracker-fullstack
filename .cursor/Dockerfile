# Base environment for the Task Tracker fullstack app.
# Provides the .NET 10 SDK (backend) and Node.js 22 + Yarn (Angular 22 frontend).
FROM mcr.microsoft.com/dotnet/sdk:10.0

ENV DEBIAN_FRONTEND=noninteractive \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    NG_CLI_ANALYTICS=false

# Angular 22 requires Node >= 22.22.3, which is newer than most distro packages.
# Install the latest Node.js 22.x from NodeSource, plus Yarn 1 (the pinned packageManager).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg git \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g yarn@1.22.22 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Run the agent as a non-root user.
RUN useradd --create-home --shell /bin/bash ubuntu
USER ubuntu
WORKDIR /home/ubuntu
