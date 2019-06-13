# InterSketch
> A sketch-based visual analytics tool for querying time series data.

## Getting Started

### Prerequisites

You need [git][git] to clone the repository.

You need a web server to run the application in development. [Python][python] has a simple web server.

### Clone InterSketch

Clone the InterSketch repository using git:

```bash
git clone https://github.com/MattJBritton/InterSketch.git
cd timesketch
```

### Start the Web Server

A web server is required to run the application in development. Navigate to the root of the project and run:

```bash
# Python 2
python -m SimpleHTTPServer

# Python 3
python -m http.server
```

By default, the web server will listen on [http://localhost:8000][server]. To change the port, run:

```bash
# Python 2
python -m SimpleHTTPServer <port>

# Python 3
python -m http.server <port>
```

## Managing Dependencies

No special mechanism is used for dependencies; global scripts are being used. See `index.html` for an example of how to load a third party script from a CDN with a local fallback. Local copies of the scripts should be placed in `js/vendor/`.
