from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="labeltrain",
    version="4.0.4",
    author="Mahdi Mirzakhani",
    author_email="mr79mahdi@gmail.com",
    description="Advanced Image Labeling Tool",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/labeltrain",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: Scientific/Engineering :: Image Recognition",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Operating System :: OS Independent",
    ],
    install_requires=[
        "PyQt6>=6.4.0",
        "opencv-python>=4.7.0",
        "numpy>=1.23.0",
        "Pillow>=9.3.0"
    ],
    entry_points={
        'console_scripts': [
            'labeltrain=label_train.__main__:main'
        ],
    },
    python_requires='>=3.8',
)