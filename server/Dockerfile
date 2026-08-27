FROM mcr.microsoft.com/dotnet/sdk:10.0-bookworm-slim AS build
WORKDIR /src
COPY TaskTracker.Api.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish TaskTracker.Api.csproj --configuration Release --no-restore --output /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0-bookworm-slim AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
# Render injects PORT (usually 10000). --urls beats the image default of 8080.
ENTRYPOINT ["/bin/sh", "-c", "exec dotnet TaskTracker.Api.dll --urls http://0.0.0.0:${PORT:-8080}"]
