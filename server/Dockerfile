# Multi-stage build for .NET 8 Web API
# Stage 1: build with the SDK image
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file first so Docker caches the restore step
COPY ExpenseApi.csproj ./
RUN dotnet restore ExpenseApi.csproj

# Copy the rest of the source
COPY . ./
RUN dotnet publish ExpenseApi.csproj -c Release -o /app/out /p:UseAppHost=false

# Stage 2: run with the smaller runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/out ./

# Render sets $PORT; bind to all interfaces
ENV ASPNETCORE_URLS=http://0.0.0.0:$PORT
EXPOSE 10000
ENTRYPOINT ["dotnet", "ExpenseApi.dll"]