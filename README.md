---
title: Movie Stream API
emoji: 🎬
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# Movie Stream API

A streaming API that extracts direct video URLs from MovieBox.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /search?q=<keyword>` | Search for movies and series |
| `GET /detail?slug=<slug>` | Get full details, cast, seasons, episodes, dubs |
| `GET /stream?slug=<slug>` | Get stream URLs for a movie |
| `GET /stream?slug=<slug>&se=1&ep=1` | Get stream URLs for a series episode |
| `GET /stream?slug=<slug>&se=1&ep=1&lang=fr` | Stream a specific dub language |

## Examples

```
/search?q=zootopia
/detail?slug=zootopia-SxDV9XZ5kg6
/stream?slug=zootopia-SxDV9XZ5kg6
/stream?slug=the-simpsons-2nXz41q46j9&se=1&ep=1
/stream?slug=the-simpsons-2nXz41q46j9&se=1&ep=1&lang=fr
```
